import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import {
  ADMIN_UID, COMPANY, DRIVER_ID, OTHER_COMPANY, SERVICE_ID, STOP_IDS, VEHICLE_ID,
  asUser, createAuthUser, createDatabase, one, rows, seed,
} from './harness'

// 030 + 031: métricas, auditoría y bitácora inmutable sobre viajes asignados
// por el panel; vehículos por conductor; retiro del flujo bajo demanda.

let db: PGlite
let driverUid: string

const OTHER_VEHICLE_ID = '00000000-0000-4000-8000-0000000000e2'
const FOREIGN_VEHICLE_ID = '00000000-0000-4000-8000-0000000000e9'

beforeAll(async () => {
  db = await createDatabase()
  await seed(db)
  await db.exec(`
    insert into vehicles (id, company_id, plate, vehicle_type) values
      ('${OTHER_VEHICLE_ID}', '${COMPANY}', 'WXYZ99', 'van'),
      ('${FOREIGN_VEHICLE_ID}', '${OTHER_COMPANY}', 'OTRA11', 'van');
  `)
  driverUid = await createAuthUser(db, 'carlos@trazza.cl')
})

describe('retiro del flujo bajo demanda (031)', () => {
  it('no quedan funciones ni columnas de la bolsa de viajes', async () => {
    for (const fn of ['mobile_request_service', 'mobile_accept_service', 'mobile_cancel_request', 'admin_publish_service']) {
      expect(await one(db, `select count(*)::int as n from pg_proc where proname = $1`, [fn])).toEqual({ n: 0 })
    }
    const cols = await rows(db, `select column_name from information_schema.columns
      where table_name = 'services' and column_name in ('dispatch_mode', 'requested_at', 'accepted_at', 'origin_name')`)
    expect(cols).toHaveLength(0)
  })
})

describe('vehículos asignados a conductores', () => {
  it('el admin asigna varios vehículos a un conductor y el conductor los ve', async () => {
    await asUser(db, ADMIN_UID, () => db.query(`
      insert into driver_vehicles (company_id, driver_id, vehicle_id) values
        ($1, $2, $3), ($1, $2, $4)`, [COMPANY, DRIVER_ID, VEHICLE_ID, OTHER_VEHICLE_ID]))
    const assigned = await asUser(db, driverUid, () =>
      rows(db, `select vehicle_id, assigned_by_profile_id from driver_vehicles where driver_id = $1 order by vehicle_id`, [DRIVER_ID]))
    expect(assigned).toEqual([
      { vehicle_id: VEHICLE_ID, assigned_by_profile_id: ADMIN_UID },
      { vehicle_id: OTHER_VEHICLE_ID, assigned_by_profile_id: ADMIN_UID },
    ])
  })

  it('no permite asignar un vehículo de otra empresa ni que el conductor se asigne vehículos', async () => {
    await asUser(db, ADMIN_UID, async () => {
      await expect(db.query(`insert into driver_vehicles (company_id, driver_id, vehicle_id) values ($1, $2, $3)`,
        [COMPANY, DRIVER_ID, FOREIGN_VEHICLE_ID])).rejects.toThrow(/row-level security/)
    })
    await asUser(db, driverUid, async () => {
      await expect(db.query(`delete from driver_vehicles where driver_id = $1`, [DRIVER_ID])).resolves.toBeTruthy()
    })
    // El delete del conductor no afecta filas (sin policy para él).
    expect(await one(db, `select count(*)::int as n from driver_vehicles`)).toEqual({ n: 2 })
  })
})

describe('cierre y métricas de un viaje asignado', () => {
  it('al finalizar se consolidan métricas reales vs. estimadas', async () => {
    await asUser(db, driverUid, async () => {
      await db.query(`select mobile_start_service($1)`, [SERVICE_ID])
      await db.query(`select mobile_report_location($1, -33.45, -70.66)`, [SERVICE_ID])
      await db.query(`select mobile_report_location($1, -33.44, -70.64, 30, null, null, true)`, [SERVICE_ID])
      await db.query(`select mobile_report_location($1, -33.42, -70.61)`, [SERVICE_ID])
      for (const stop of STOP_IDS.slice(0, 2)) await db.query(`select mobile_set_stop_status($1, 'completed')`, [stop])
      await db.query(`select mobile_finish_service($1)`, [SERVICE_ID])
    })
    const m = await one<Record<string, unknown>>(db,
      `select location_points, simulated_points, actual_distance_km::float as km, estimated_duration_minutes::float as est,
              stops_completed, stops_unconfirmed, anomalies, jsonb_array_length(trajectory) as traj
       from service_metrics where service_id = $1`, [SERVICE_ID])
    // Programado 08:30 → 09:15: 45 min estimados.
    expect(m).toMatchObject({ location_points: 3, simulated_points: 1, traj: 3, est: 45, stops_completed: 2, stops_unconfirmed: 1 })
    expect(m.km as number).toBeGreaterThan(4)
    expect(m.anomalies).toEqual(expect.arrayContaining(['simulated_gps', 'unconfirmed_stops', 'late_start']))
    expect(await rows(db, `select 1 from service_events where service_id = $1 and event_type = 'metrics_consolidated'`, [SERVICE_ID]))
      .toHaveLength(1)
  })

  it('sin hora de término ni estimación de ruta, la duración se deriva de la distancia', async () => {
    const serviceId = await asUser(db, ADMIN_UID, async () => {
      const { id } = await one<{ id: string }>(db, `select admin_create_route_service($1::jsonb) as id`, [JSON.stringify({
        route_code: 'R-EST', driver_id: DRIVER_ID, vehicle_id: OTHER_VEHICLE_ID,
        scheduled_date: '2026-10-11', scheduled_start_time: '10:00',
        origin: { name: 'Plaza', lat: -23.6466, lng: -70.3979 },
        destination: { name: 'Mall', lat: -23.6338, lng: -70.3963 },
        stops: [],
      })])
      await db.query(`select admin_start_service($1)`, [id])
      await db.query(`select admin_finish_service($1)`, [id])
      return id
    })
    const m = await one<{ dist: number; est: number }>(db,
      `select estimated_distance_km::float as dist, estimated_duration_minutes::float as est from service_metrics where service_id = $1`, [serviceId])
    expect(m.dist).toBeGreaterThan(1.5)
    expect(m.est).toBe(Math.max(5, Math.ceil((m.dist / 30) * 60)))
  })

  it('la bitácora y los pings son inmutables', async () => {
    await expect(db.query(`update service_events set payload = '{}' where service_id = $1`, [SERVICE_ID]))
      .rejects.toThrow('inmutable')
    await expect(db.query(`delete from service_locations where service_id = $1`, [SERVICE_ID]))
      .rejects.toThrow('inmutable')
  })
})

describe('auditoría del admin', () => {
  it('no audita servicios abiertos', async () => {
    const open = '00000000-0000-4000-8000-000000000052'
    await asUser(db, ADMIN_UID, async () => {
      await expect(db.query(`select admin_audit_service($1, 'approved')`, [open])).rejects.toThrow('finalizados o cancelados')
    })
  })

  it('observar exige comentario; queda historial, estado y audit_logs', async () => {
    await asUser(db, ADMIN_UID, async () => {
      await expect(db.query(`select admin_audit_service($1, 'observed', '  ')`, [SERVICE_ID])).rejects.toThrow('observación')
      await db.query(`select admin_audit_service($1, 'observed', 'GPS simulado en la demo')`, [SERVICE_ID])
      await db.query(`select admin_audit_service($1, 'approved', 'Revisado con el conductor')`, [SERVICE_ID])
    })
    expect(await one(db, `select audit_status, audited_by_profile_id from services where id = $1`, [SERVICE_ID]))
      .toEqual({ audit_status: 'approved', audited_by_profile_id: ADMIN_UID })
    expect(await rows(db, `select decision from service_audits where service_id = $1`, [SERVICE_ID])).toHaveLength(2)
    expect(await rows(db, `select 1 from audit_logs where entity_id = $1 and action = 'service_audited'`, [SERVICE_ID]))
      .toHaveLength(2)
    await expect(db.query(`update service_audits set decision = 'approved' where service_id = $1`, [SERVICE_ID]))
      .rejects.toThrow('inmutable')
  })

  it('un conductor no puede auditar', async () => {
    await asUser(db, driverUid, async () => {
      await expect(db.query(`select admin_audit_service($1, 'approved')`, [SERVICE_ID])).rejects.toThrow('administrador')
    })
  })
})
