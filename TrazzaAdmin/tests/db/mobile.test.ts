import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import {
  COMPANY, DRIVER_ID, OTHER_SERVICE_ID, PAX_ID, SERVICE_ID, STOP_IDS, VEHICLE_ID,
  asUser, createAuthUser, createDatabase, one, rows, seed,
} from './harness'

// Migración 025: la app móvil sobre la base del panel.

let db: PGlite
let driverUid: string
let paxUid: string

beforeAll(async () => {
  db = await createDatabase()
  await seed(db)
  driverUid = await createAuthUser(db, 'carlos@trazza.cl')
  paxUid = await createAuthUser(db, 'juan@trazza.cl')
})

describe('vinculación de cuentas', () => {
  it('al crear el usuario de Auth se crea el perfil y se vincula por correo (sin importar mayúsculas)', async () => {
    expect(await one(db, 'select role, company_id from profiles where id = $1', [driverUid])).toEqual({ role: 'driver', company_id: COMPANY })
    expect(await one(db, 'select role from profiles where id = $1', [paxUid])).toEqual({ role: 'passenger' })
    expect(await one(db, 'select profile_id from drivers where id = $1', [DRIVER_ID])).toEqual({ profile_id: driverUid })
    expect(await one(db, 'select profile_id from passengers where id = $1', [PAX_ID])).toEqual({ profile_id: paxUid })
  })

  it('también vincula si el pasajero se registra después del usuario', async () => {
    const uid = await createAuthUser(db, 'tarde@trazza.cl')
    await db.exec(`insert into passengers (company_id, full_name, rut, email) values ('${COMPANY}', 'Tarde', '4-3', 'tarde@trazza.cl')`)
    expect(await one(db, 'select p.role, pa.profile_id = p.id as linked from profiles p join passengers pa on pa.email = p.email where p.id = $1', [uid]))
      .toEqual({ role: 'passenger', linked: true })
  })

  it('un correo sin conductor ni pasajero no crea perfil', async () => {
    const uid = await createAuthUser(db, 'nadie@x.cl')
    expect(await rows(db, 'select 1 from profiles where id = $1', [uid])).toHaveLength(0)
  })
})

describe('aislamiento del pasajero', () => {
  it('solo ve sus servicios, su perfil y su fila de pasajero', async () => {
    await asUser(db, paxUid, async () => {
      expect(await rows(db, 'select service_code from services')).toEqual([{ service_code: 'S1' }])
      expect(await rows(db, 'select 1 from profiles')).toHaveLength(1)
      expect(await rows(db, 'select 1 from passengers')).toHaveLength(1)
      expect(await rows(db, 'select 1 from service_stops')).toHaveLength(3)
    })
  })

  it('no ve datos de la empresa: conductores, empresa ni otros pasajeros', async () => {
    await asUser(db, paxUid, async () => {
      expect(await rows(db, 'select * from drivers')).toHaveLength(0)
      expect(await rows(db, 'select * from companies')).toHaveLength(0)
    })
  })

  it('ve nombre y teléfono de su conductor, solo de sus servicios', async () => {
    await asUser(db, paxUid, async () => {
      expect(await rows(db, `select full_name, phone from get_service_driver('${SERVICE_ID}')`)).toEqual([{ full_name: 'Carlos Mendoza', phone: '+569222' }])
      expect(await rows(db, `select * from get_service_driver('${OTHER_SERVICE_ID}')`)).toHaveLength(0)
    })
  })

  it('los campos calculados cuentan a todos los pasajeros y usan hora de Chile', async () => {
    await asUser(db, paxUid, async () => {
      const row = await one<{ at: Date; pax: number }>(db, 'select mobile_scheduled_at(services) as at, mobile_passenger_count(services) as pax from services')
      expect(row.pax).toBe(2)
      expect(row.at.toISOString()).toBe('2026-10-09T11:30:00.000Z') // 08:30 en Chile (UTC-3)
    })
  })

  it('no puede escribir en contract_passengers (corrección de 024)', async () => {
    await db.exec(`insert into contracts (id, company_id, client_name) values ('00000000-0000-4000-8000-000000000099', '${COMPANY}', 'X')`)
    await asUser(db, paxUid, async () => {
      await expect(db.query(`insert into contract_passengers (company_id, contract_id, passenger_id) values ('${COMPANY}', '00000000-0000-4000-8000-000000000099', '${PAX_ID}')`))
        .rejects.toThrow(/row-level security/)
    })
  })
})

describe('funciones de la app', () => {
  it('el pasajero reporta incidentes solo en sus servicios', async () => {
    await asUser(db, paxUid, async () => {
      await db.query(`select mobile_report_incident('${SERVICE_ID}', 'retraso_ruta', 'Retraso', 'Llegó tarde', 'media')`)
      await expect(db.query(`select mobile_report_incident('${OTHER_SERVICE_ID}', 'otro', 'x', 'y')`)).rejects.toThrow('No puedes reportar')
      await expect(db.query(`select mobile_start_service('${SERVICE_ID}')`)).rejects.toThrow('no está asociada a un conductor')
    })
    expect(await one(db, `select i.reported_by_type, i.severity, t.name from incidents i join incident_types t on t.id = i.incident_type_id`))
      .toEqual({ reported_by_type: 'passenger', severity: 'medium', name: 'Retraso en ruta' })
  })

  it('el conductor completa el servicio de punta a punta', async () => {
    await asUser(db, driverUid, async () => {
      await expect(db.query(`select mobile_report_location('${OTHER_SERVICE_ID}', -33.4, -70.6)`)).rejects.toThrow('no está asignado')
      await db.query(`select mobile_start_service('${SERVICE_ID}', 123456)`)
      await db.query(`select mobile_start_service('${SERVICE_ID}')`) // idempotente
      await db.query(`select mobile_report_location('${SERVICE_ID}', -33.45, -70.66, 40, 90, 5)`)
      await db.query(`select mobile_set_stop_status('${STOP_IDS[0]}', 'completed')`)
      expect(await one(db, `select status from service_stops where id = '${STOP_IDS[1]}'`)).toEqual({ status: 'next' })
      await db.query(`select mobile_set_stop_status('${STOP_IDS[1]}', 'completed')`)
      await db.query(`select mobile_set_stop_status('${STOP_IDS[2]}', 'completed')`)
      await db.query(`select mobile_finish_service('${SERVICE_ID}')`)
      await expect(db.query(`select mobile_set_stop_status('${STOP_IDS[0]}', 'xx')`)).rejects.toThrow('no válido')
    })

    expect(await one(db, `select status, completion_source from services where id = '${SERVICE_ID}'`)).toEqual({ status: 'completed', completion_source: 'driver' })
    expect(await one(db, `select status, current_odometer_km::int as km from vehicles where id = '${VEHICLE_ID}'`)).toEqual({ status: 'available', km: 123456 })
    expect(await one(db, `select count(*)::int as n from service_locations where service_id = '${SERVICE_ID}'`)).toEqual({ n: 1 })
    const events = await rows<{ event_type: string }>(db, `select event_type from service_events where service_id = '${SERVICE_ID}' and actor_type = 'driver' order by created_at`)
    expect(events.map(e => e.event_type)).toEqual(['service_started', 'stop_completed', 'stop_completed', 'stop_completed', 'service_finished'])
  })

  it('publica en realtime las tablas que usan las apps', async () => {
    const tables = await rows<{ tablename: string }>(db, `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`)
    expect(tables.map(t => t.tablename)).toEqual(['service_locations', 'service_stops', 'services'])
  })
})
