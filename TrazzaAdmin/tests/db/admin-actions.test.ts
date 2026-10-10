import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import {
  ADMIN_UID, COMPANY, DRIVER_ID, OTHER_COMPANY, PAX_ID, ROUTE_ID, VEHICLE_ID,
  asUser, createAuthUser, createDatabase, one, rows, seed,
} from './harness'

// Migraciones 026-028: acciones del panel en una sola transacción.

let db: PGlite
let driverUid: string

const A1 = '00000000-0000-4000-8000-000000000061'
const A2 = '00000000-0000-4000-8000-000000000062'
const FOREIGN = '00000000-0000-4000-8000-000000000063'

const resources = () => one(db, `
  select (select status from vehicles where id = '${VEHICLE_ID}') as vehicle,
         (select status from drivers where id = '${DRIVER_ID}') as driver`)

beforeAll(async () => {
  db = await createDatabase()
  await seed(db)
  driverUid = await createAuthUser(db, 'carlos@trazza.cl')
  await db.exec(`
    insert into services (id, company_id, route_id, service_code, scheduled_date, driver_id, vehicle_id) values
      ('${A1}', '${COMPANY}', '${ROUTE_ID}', 'A1', '2026-10-10', '${DRIVER_ID}', '${VEHICLE_ID}'),
      ('${A2}', '${COMPANY}', '${ROUTE_ID}', 'A2', '2026-10-10', '${DRIVER_ID}', '${VEHICLE_ID}'),
      ('${FOREIGN}', '${OTHER_COMPANY}', null, 'OTRA', '2026-10-10', null, null);
  `)
})

describe('iniciar / cancelar / finalizar (027)', () => {
  it('iniciar pone servicio, vehículo y conductor en curso', async () => {
    await asUser(db, ADMIN_UID, () => db.query(`select admin_start_service('${A1}')`))
    expect(await resources()).toEqual({ vehicle: 'in_service', driver: 'in_service' })
    await asUser(db, ADMIN_UID, async () => {
      await expect(db.query(`select admin_start_service('${A1}')`)).rejects.toThrow('ya está en curso')
    })
  })

  it('cancelar otro servicio no libera el bus si sigue en uno en curso', async () => {
    await asUser(db, ADMIN_UID, async () => {
      await db.query(`select admin_start_service('${A2}')`)
      await db.query(`select admin_cancel_service('${A2}', '  bus en panne ')`)
    })
    expect(await resources()).toEqual({ vehicle: 'in_service', driver: 'in_service' })
    expect(await one(db, `select status, cancel_reason, actual_end_at is not null as ended from services where id = '${A2}'`))
      .toEqual({ status: 'cancelled', cancel_reason: 'bus en panne', ended: true })
  })

  it('finalizar libera recursos y registra quién y cómo', async () => {
    await asUser(db, ADMIN_UID, () => db.query(`select admin_finish_service('${A1}', 'Todo ok')`))
    expect(await resources()).toEqual({ vehicle: 'available', driver: 'available' })
    expect(await one(db, `select completion_source, finalized_by_profile_id, notes from services where id = '${A1}'`))
      .toEqual({ completion_source: 'admin', finalized_by_profile_id: ADMIN_UID, notes: 'Todo ok' })
    const events = await rows<{ e: string }>(db, `select event_type || ':' || actor_type as e from service_events where service_id in ('${A1}', '${A2}') order by created_at, event_type`)
    expect(events.map(r => r.e)).toEqual(['service_started:admin', 'service_started:admin', 'service_cancelled:admin', 'service_finished:admin'])
  })

  it('rechaza servicios cerrados, de otra empresa y a quien no es admin', async () => {
    await asUser(db, ADMIN_UID, async () => {
      await expect(db.query(`select admin_cancel_service('${A1}')`)).rejects.toThrow('ya está cerrado')
      await expect(db.query(`select admin_cancel_service('${FOREIGN}')`)).rejects.toThrow('ya no existe')
      await expect(db.query(`select lock_service_for_admin('${A1}')`)).rejects.toThrow('permission denied')
    })
    await asUser(db, driverUid, async () => {
      await expect(db.query(`select admin_start_service('${A2}')`)).rejects.toThrow('Solo un administrador')
    })
  })
})

describe('crear ruta + servicio (028)', () => {
  const input = (code: string, extra: Record<string, unknown> = {}) => JSON.stringify({
    route_code: code, contract_id: null, driver_id: DRIVER_ID, vehicle_id: VEHICLE_ID,
    scheduled_date: '2026-10-11', scheduled_start_time: '07:45',
    origin: { name: 'Duoc Maipú', address: 'Av. Pajaritos', lat: -33.51, lng: -70.75 },
    destination: { name: 'Plaza Oeste', address: '', lat: null, lng: null },
    stops: [
      { name: 'Juan Marchant', address: 'Calle 1', lat: -33.5, lng: -70.7, passenger_id: PAX_ID },
      { name: 'Parada libre', address: 'Calle 2', lat: null, lng: null, passenger_id: null },
    ],
    ...extra,
  })

  const counts = () => one(db, 'select (select count(*) from routes)::int as r, (select count(*) from services)::int as s')

  it('crea ruta, paradas, servicio, pasajeros y códigos de acceso', async () => {
    const { id } = await asUser(db, ADMIN_UID, () => one<{ id: string }>(db, 'select admin_create_route_service($1::jsonb) as id', [input('NEW-1')]))
    const stops = await rows<{ s: string }>(db, `select stop_order || '.' || stop_type || ':' || name as s from service_stops where service_id = $1 order by stop_order`, [id])
    expect(stops.map(r => r.s)).toEqual(['1.origin:Duoc Maipú', '2.pickup:Juan Marchant', '3.pickup:Parada libre', '4.destination:Plaza Oeste'])
    const access = await rows<{ code_ok: boolean }>(db, `select psa.access_code ~ '^[A-HJ-NP-Z2-9]{6}$' as code_ok from passenger_service_access psa where psa.service_id = $1`, [id])
    expect(access).toEqual([{ code_ok: true }])
  })

  it('si algo falla no deja nada a medias', async () => {
    const before = await counts()
    await asUser(db, ADMIN_UID, async () => {
      await expect(db.query('select admin_create_route_service($1::jsonb)', [input('NEW-1')])).rejects.toMatchObject({ code: '23505' })
      await expect(db.query('select admin_create_route_service($1::jsonb)', [input('NEW-2', { stops: [{ name: 'x', passenger_id: '00000000-0000-4000-8000-0000000000ff' }] })]))
        .rejects.toThrow('pasajeros seleccionados ya no está disponible')
      await expect(db.query('select admin_create_route_service($1::jsonb)', [input('NEW-3', { vehicle_id: '00000000-0000-4000-8000-0000000000ff' })]))
        .rejects.toThrow('vehículo seleccionado ya no está disponible')
    })
    expect(await counts()).toEqual(before)
  })
})

describe('eliminar ruta (026)', () => {
  it('cancela sus servicios programados y conserva los cerrados', async () => {
    await db.exec(`
      insert into routes (id, company_id, route_code, name) values ('00000000-0000-4000-8000-0000000000f9', '${COMPANY}', 'DEL', 'Borrar');
      insert into services (company_id, route_id, service_code, scheduled_date, status) values
        ('${COMPANY}', '00000000-0000-4000-8000-0000000000f9', 'P1', '2026-10-12', 'scheduled'),
        ('${COMPANY}', '00000000-0000-4000-8000-0000000000f9', 'C1', '2026-10-01', 'completed');
      update routes set deleted_at = now() where id = '00000000-0000-4000-8000-0000000000f9';
    `)
    const result = await rows(db, `select service_code, status, deleted_at is not null as deleted from services where route_id = '00000000-0000-4000-8000-0000000000f9' order by service_code`)
    expect(result).toEqual([
      { service_code: 'C1', status: 'completed', deleted: false },
      { service_code: 'P1', status: 'cancelled', deleted: true },
    ])
  })
})
