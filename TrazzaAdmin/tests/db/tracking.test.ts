import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import {
  ADMIN_UID, COMPANY, SERVICE_ID, VEHICLE_ID,
  asUser, createAuthUser, createDatabase, one, rows, seed,
} from './harness'

// Migración 029: seguimiento GPS solo en servicios en curso y escrituras cerradas.

let db: PGlite
let driverUid: string

beforeAll(async () => {
  db = await createDatabase()
  await seed(db)
  driverUid = await createAuthUser(db, 'carlos@trazza.cl')
})

const report = () => db.query(`select mobile_report_location('${SERVICE_ID}', -33.45, -70.66)`)

describe('ubicación del conductor', () => {
  it('rechaza posiciones antes de iniciar el servicio', async () => {
    await asUser(db, driverUid, async () => {
      await expect(report()).rejects.toThrow('ya no está en curso')
    })
  })

  it('las acepta en curso y deja de aceptarlas cuando el panel cancela', async () => {
    await asUser(db, driverUid, async () => {
      await db.query(`select mobile_start_service('${SERVICE_ID}')`)
      await report()
    })
    await asUser(db, ADMIN_UID, () => db.query(`select admin_cancel_service('${SERVICE_ID}', 'Prueba')`))
    await asUser(db, driverUid, async () => {
      await expect(report()).rejects.toThrow('ya no está en curso')
    })
    expect(await one(db, `select count(*)::int as n from service_locations`)).toEqual({ n: 1 })
  })

  it('el conductor no puede insertar posiciones ni eventos directo', async () => {
    await asUser(db, driverUid, async () => {
      await expect(db.query(
        `insert into service_locations (company_id, service_id, latitude, longitude) values ('${COMPANY}', '${SERVICE_ID}', 0, 0)`
      )).rejects.toThrow(/row-level security/)
      await expect(db.query(
        `insert into service_events (company_id, service_id, actor_type, event_type) values ('${COMPANY}', '${SERVICE_ID}', 'driver', 'service_finished')`
      )).rejects.toThrow(/row-level security/)
    })
  })

  it('el admin sigue registrando eventos desde el panel', async () => {
    await asUser(db, ADMIN_UID, () => db.query(
      `insert into service_events (company_id, service_id, actor_type, actor_id, event_type) values ('${COMPANY}', '${SERVICE_ID}', 'admin', '${ADMIN_UID}', 'note_added')`
    ))
    expect(await rows(db, `select 1 from service_events where event_type = 'note_added'`)).toHaveLength(1)
  })
})

describe('finalizar desde la app', () => {
  it('no libera un vehículo que sigue en otro servicio en curso', async () => {
    const second = '00000000-0000-4000-8000-000000000053'
    const third = '00000000-0000-4000-8000-000000000054'
    await db.exec(`
      insert into services (id, company_id, service_code, scheduled_date, driver_id, vehicle_id, status, actual_start_at) values
        ('${second}', '${COMPANY}', 'S3', '2026-10-10', (select id from drivers limit 1), '${VEHICLE_ID}', 'in_progress', now()),
        ('${third}', '${COMPANY}', 'S4', '2026-10-10', null, '${VEHICLE_ID}', 'in_progress', now());
      update vehicles set status = 'in_service' where id = '${VEHICLE_ID}';
    `)
    await asUser(db, driverUid, () => db.query(`select mobile_finish_service('${second}')`))
    expect(await one(db, `select status from vehicles where id = '${VEHICLE_ID}'`)).toEqual({ status: 'in_service' })
  })
})
