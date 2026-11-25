import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import {
  ADMIN_UID, DRIVER_ID, OTHER_PAX_ID, PAX_ID, VEHICLE_ID,
  asUser, createAuthUser, createDatabase, one, rows, seed,
} from './harness'

// 032: origen → recogidas → bajadas → destino final.
// 033: ruta planificada por calles (planned_path) y distancia estimada.
// 034: completar una recogida deja a sus pasajeros abordados.
// 035: regreso a la base al final del recorrido.

let db: PGlite
let driverUid: string
let paxUid: string
let serviceId: string

type Stop = { id: string; stop_order: number; stop_type: string; name: string; address: string | null; status: string }

beforeAll(async () => {
  db = await createDatabase()
  await seed(db)
  driverUid = await createAuthUser(db, 'carlos@trazza.cl')
  paxUid = await createAuthUser(db, 'juan@trazza.cl')

  const created = await asUser(db, ADMIN_UID, () => one<{ id: string }>(db,
    `select public.admin_create_route_service($1::jsonb) as id`, [JSON.stringify({
      route_code: 'R-PD-1', driver_id: DRIVER_ID, vehicle_id: VEHICLE_ID,
      scheduled_date: '2026-10-10', scheduled_start_time: '08:00',
      origin: { name: 'Base', address: 'Av. Argentina 2400', lat: -23.654, lng: -70.394 },
      destination: { name: 'Planta', address: 'Av. Argentina 3200', lat: -23.661, lng: -70.393 },
      stops: [
        { name: 'Juan Marchant', address: 'Av. Argentina 2800', lat: -23.657, lng: -70.394, passenger_id: PAX_ID,
          dropoff: { address: 'Hospital Regional', lat: -23.659, lng: -70.393 } },
        { name: 'Otra Persona', address: 'Atacama 2500', lat: -23.655, lng: -70.395, passenger_id: OTHER_PAX_ID,
          dropoff: null },
      ],
    })]))
  serviceId = created.id
})

const stops = () => rows<Stop>(db,
  `select id, stop_order, stop_type, name, address, status from service_stops where service_id = $1 order by stop_order`, [serviceId])

describe('recorrido con recogidas y bajadas', () => {
  it('ordena origen, recogidas, bajadas con destino propio y destino final', async () => {
    const list = await stops()
    expect(list.map(s => [s.stop_type, s.address])).toEqual([
      ['origin', 'Av. Argentina 2400'],
      ['pickup', 'Av. Argentina 2800'],
      ['pickup', 'Atacama 2500'],
      ['dropoff', 'Hospital Regional'],
      ['destination', 'Av. Argentina 3200'],
    ])
  })

  it('enlaza cada pasajero con su recogida y su bajada (null = destino final)', async () => {
    const list = await stops()
    const links = await rows<{ passenger_id: string; service_stop_id: string; dropoff_stop_id: string | null }>(db,
      `select passenger_id, service_stop_id, dropoff_stop_id from service_passengers where service_id = $1 order by passenger_id`, [serviceId])
    expect(links).toEqual([
      { passenger_id: PAX_ID, service_stop_id: list[1].id, dropoff_stop_id: list[3].id },
      { passenger_id: OTHER_PAX_ID, service_stop_id: list[2].id, dropoff_stop_id: null },
    ])
  })

  it('cuenta quién sube y quién baja en cada parada', async () => {
    const counts = await rows<{ stop_type: string; n: number }>(db,
      `select st.stop_type, public.mobile_passenger_count(st) as n from service_stops st
       where st.service_id = $1 order by st.stop_order`, [serviceId])
    expect(counts.map(c => c.n)).toEqual([0, 1, 1, 1, 1])
  })

  it('el pasajero ve su propia recogida y bajada', async () => {
    const mine = await asUser(db, paxUid, () => rows(db,
      `select service_stop_id is not null as pickup, dropoff_stop_id is not null as dropoff
       from service_passengers where service_id = $1`, [serviceId]))
    expect(mine).toEqual([{ pickup: true, dropoff: true }])
  })

  it('al iniciar, el origen queda como salida y la primera recogida como siguiente', async () => {
    await asUser(db, driverUid, () => db.query(`select public.mobile_start_service($1)`, [serviceId]))
    const list = await stops()
    expect(list.map(s => s.status)).toEqual(['completed', 'next', 'pending', 'pending', 'pending'])
    const event = await one<{ n: number }>(db,
      `select count(*)::int as n from service_events where service_id = $1 and event_type = 'stop_completed'
       and payload->>'stop_type' = 'origin'`, [serviceId])
    expect(event.n).toBe(1)
  })
})

describe('ruta planificada por calles (033)', () => {
  it('guarda el recorrido y lo usa como distancia y duración estimadas', async () => {
    const path = [[-23.654, -70.394], [-23.650, -70.396], [-23.646, -70.398], [-23.659, -70.401]]
    const created = await asUser(db, ADMIN_UID, () => one<{ id: string }>(db,
      `select public.admin_create_route_service($1::jsonb) as id`, [JSON.stringify({
        route_code: 'R-PD-2', driver_id: DRIVER_ID, vehicle_id: VEHICLE_ID,
        scheduled_date: '2026-10-11', scheduled_start_time: '08:00',
        origin: { name: 'Base', lat: -23.654, lng: -70.394 },
        destination: { name: 'Parque', lat: -23.659, lng: -70.401 },
        stops: [{ name: 'Juan Marchant', address: 'Plaza Colón', lat: -23.646, lng: -70.398, passenger_id: PAX_ID }],
        planned_path: path, planned_distance_km: 3.456, planned_duration_minutes: 11.2,
      })]))
    const row = await one<{ planned_path: number[][]; estimated_distance_km: string; estimated_duration_minutes: number }>(db,
      `select planned_path, estimated_distance_km, estimated_duration_minutes from services where id = $1`, [created.id])
    expect(row).toEqual({ planned_path: path, estimated_distance_km: '3.46', estimated_duration_minutes: 12 })
  })

  it('sin recorrido el viaje se crea igual', async () => {
    const row = await one<{ planned_path: unknown }>(db, `select planned_path from services where id = $1`, [serviceId])
    expect(row.planned_path).toBeNull()
  })
})

describe('pasajero a bordo al completar la recogida (034)', () => {
  it('marca abordado solo al pasajero de esa recogida y lo registra en la bitácora', async () => {
    const list = await stops()
    await asUser(db, driverUid, () => db.query(`select public.mobile_set_stop_status($1, 'completed')`, [list[1].id]))
    const pax = await rows<{ passenger_id: string; attendance_status: string; boarded: boolean }>(db,
      `select passenger_id, attendance_status, boarded_at is not null as boarded
       from service_passengers where service_id = $1 order by passenger_id`, [serviceId])
    expect(pax).toEqual([
      { passenger_id: PAX_ID, attendance_status: 'boarded', boarded: true },
      { passenger_id: OTHER_PAX_ID, attendance_status: 'pending', boarded: false },
    ])
    const ev = await one<{ n: number }>(db, `select count(*)::int as n from service_events
      where service_id = $1 and event_type = 'passenger_boarded' and payload->>'passenger_id' = $2`, [serviceId, PAX_ID])
    expect(ev.n).toBe(1)
  })
})

describe('regreso a la base (035)', () => {
  it('agrega el regreso al origen después del destino, sin pasajeros', async () => {
    const created = await asUser(db, ADMIN_UID, () => one<{ id: string }>(db,
      `select public.admin_create_route_service($1::jsonb) as id`, [JSON.stringify({
        route_code: 'R-PD-3', driver_id: DRIVER_ID, vehicle_id: VEHICLE_ID,
        scheduled_date: '2026-10-12', scheduled_start_time: '06:00', return_to_origin: true,
        origin: { name: 'Base', address: 'Av. Argentina 2400', lat: -23.654, lng: -70.394 },
        destination: { name: 'Faena', address: 'Puerto', lat: -23.652, lng: -70.403 },
        stops: [
          { name: 'Juan Marchant', address: 'Parque Brasil', lat: -23.659, lng: -70.401, passenger_id: PAX_ID },
          { name: 'Otra Persona', address: 'Plaza Colón', lat: -23.646, lng: -70.398, passenger_id: OTHER_PAX_ID },
        ],
      })]))
    const list = await rows<{ stop_type: string; address: string; n: number }>(db,
      `select st.stop_type, st.address, public.mobile_passenger_count(st) as n from service_stops st
       where st.service_id = $1 order by st.stop_order`, [created.id])
    expect(list).toEqual([
      { stop_type: 'origin', address: 'Av. Argentina 2400', n: 0 },
      { stop_type: 'pickup', address: 'Parque Brasil', n: 1 },
      { stop_type: 'pickup', address: 'Plaza Colón', n: 1 },
      { stop_type: 'destination', address: 'Puerto', n: 2 },
      { stop_type: 'return', address: 'Av. Argentina 2400', n: 0 },
    ])
  })
})
