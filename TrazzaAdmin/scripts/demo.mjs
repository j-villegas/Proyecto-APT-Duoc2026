// Herramientas para la demo de extremo a extremo con el flujo real: el admin
// asigna vehículo al conductor y crea el viaje con sus pasajeros → conductor
// y pasajero lo ven en la app → inicio, seguimiento en vivo → auditoría.
// No reemplazan ningún flujo de la app: solo preparan cuentas de prueba y
// verifican que todo responda.
//
//   npm run demo:seed            Cuentas listas: "Conductor Demo" y "Pasajero
//                                Demo" (registrados y vinculados), más la
//                                cuenta pasajero.nuevo@… SIN pasajero: se
//                                habilita en vivo creándolo en el panel.
//   npm run demo:seed -- --vehicle  Además un vehículo DEMO01 (plan B).
//   npm run demo:check           Ensayo automático por la API real (mismas
//                                funciones y RLS que el panel y la app):
//                                asignación de vehículo, creación del viaje,
//                                inicio con aviso Realtime, GPS simulado,
//                                cierre y métricas. Requiere DEMO_ADMIN_EMAIL
//                                y DEMO_ADMIN_PASSWORD en .env.local.
//   npm run demo:reset           Cancela viajes abiertos de las cuentas demo
//                                para repetir la demo desde cero.
//
// Requiere en .env.local: DATABASE_URL (Session pooler o conexión directa),
// NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. Opcionales:
// DEMO_PASSWORD, DEMO_DRIVER_EMAIL, DEMO_PASSENGER_EMAIL, DEMO_NEW_PASSENGER_EMAIL,
// DEMO_COMPANY_ID.
//
// Las cuentas se crean directo en auth.users (contraseña con bcrypt de
// pgcrypto, correo confirmado) porque el panel no crea usuarios de Auth y el
// SMTP por defecto de Supabase no envía correos a dominios de prueba. Al
// crearse, el trigger de 025 las vincula con el conductor/pasajero del mismo
// correo, igual que una cuenta creada en Authentication > Users.

import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

const require = createRequire(import.meta.url)
const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')

const PASSWORD = process.env.DEMO_PASSWORD || 'TrazzaDemo2026'
const DRIVER_EMAIL = (process.env.DEMO_DRIVER_EMAIL || 'conductor.demo@demo.trazza.cl').toLowerCase()
const PASSENGER_EMAIL = (process.env.DEMO_PASSENGER_EMAIL || 'pasajero.demo@demo.trazza.cl').toLowerCase()
const NEW_PASSENGER_EMAIL = (process.env.DEMO_NEW_PASSENGER_EMAIL || 'pasajero.nuevo@demo.trazza.cl').toLowerCase()
const DEMO_PLATE = 'DEMO01'
// Contrato propio de la demo: al crear el viaje en el panel, sus pasajeros
// aparecen como paradas. demo:reset vacía su lista para que en cada
// presentación solo esté el pasajero que se registra en vivo.
const DEMO_CONTRACT = 'Contrato Demo'
// Cuadrilla fija del contrato demo (transporte de personal): el conductor los
// recoge junto al pasajero que se registra en vivo. Sin cuenta en la app.
const DEMO_CREW = [
  { name: 'Pedro Soto', rut: 'DEMO-CUADRILLA-1' },
  { name: 'Camila Díaz', rut: 'DEMO-CUADRILLA-2' },
]

/** Deja a la cuadrilla demo en el contrato demo (en este orden de recogida). */
async function ensureCrew(client, company) {
  const contract = await client.query(
    `select id from contracts where company_id = $1 and contract_name = $2 and deleted_at is null`, [company, DEMO_CONTRACT])
  if (!contract.rows[0]) return
  for (const member of DEMO_CREW) {
    const { rows: [pax] } = await client.query(`
      insert into passengers (company_id, full_name, rut, status)
      values ($1, $2, $3, 'active')
      on conflict (company_id, rut) do update set full_name = excluded.full_name, deleted_at = null, status = 'active'
      returning id`, [company, member.name, member.rut])
    await client.query(`
      insert into contract_passengers (company_id, contract_id, passenger_id)
      values ($1, $2, $3)
      on conflict (contract_id, passenger_id) do update set deleted_at = null`,
      [company, contract.rows[0].id, pax.id])
  }
  ok(`Cuadrilla en "${DEMO_CONTRACT}": ${DEMO_CREW.map(m => m.name).join(', ')}`)
}

// Viaje de ensayo en Antofagasta (Plaza Colón → Mall Plaza).
const DEMO_TRIP = {
  origin: { name: 'Plaza Colón', address: 'Plaza Colón, Antofagasta', lat: -23.6466, lng: -70.3979 },
  destination: { name: 'Mall Plaza Antofagasta', address: 'Av. Balmaceda 2355, Antofagasta', lat: -23.6338, lng: -70.3963 },
}

const ok = msg => console.log(`  ✔ ${msg}`)
const info = msg => console.log(`  · ${msg}`)
const fail = msg => {
  console.error(`  ✖ ${msg}`)
  process.exitCode = 1
}

async function db() {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env.local.')
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  return client
}

async function companyId(client) {
  if (process.env.DEMO_COMPANY_ID) return process.env.DEMO_COMPANY_ID
  const { rows } = await client.query(`
    select c.id, c.name from companies c
    where exists (select 1 from profiles p where p.company_id = c.id and p.role = 'admin' and p.deleted_at is null)
  `)
  if (rows.length !== 1) {
    throw new Error(`Hay ${rows.length} empresas con administrador. Define DEMO_COMPANY_ID en .env.local.`)
  }
  return rows[0].id
}

/** Crea (o actualiza la contraseña de) un usuario de Auth con correo confirmado. */
async function ensureAuthUser(client, email, fullName) {
  const { rows } = await client.query('select id from auth.users where lower(email) = $1', [email])
  if (rows[0]) {
    await client.query(`
      update auth.users
      set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          banned_until = null, deleted_at = null, updated_at = now()
      where id = $1`, [rows[0].id, PASSWORD])
    return { id: rows[0].id, created: false }
  }

  const id = randomUUID()
  await client.query('begin')
  try {
    await client.query(`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token,
        is_sso_user, is_anonymous
      ) values (
        '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
        extensions.crypt($3, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', $4::text), now(), now(),
        '', '', '', '', '', '', '', '', false, false
      )`, [id, email, PASSWORD, fullName])
    await client.query(`
      insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), $1::text, $1::uuid,
        jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true), 'email', now(), now(), now())
    `, [id, email])
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  }
  return { id, created: true }
}

async function linkStatus(client, email) {
  const { rows } = await client.query(`
    select p.role,
      (select d.id from drivers d where d.profile_id = u.id and d.deleted_at is null limit 1) as driver_id,
      (select pa.id from passengers pa where pa.profile_id = u.id and pa.deleted_at is null limit 1) as passenger_id
    from auth.users u left join profiles p on p.id = u.id
    where lower(u.email) = $1`, [email])
  return rows[0] ?? null
}

// ── seed ──────────────────────────────────────────────────────────────────────

async function seed({ vehicle }) {
  const client = await db()
  try {
    const company = await companyId(client)
    console.log('\nCuentas de demo')

    // Conductor: fila en drivers + cuenta. El trigger de 025 los vincula.
    const driver = await client.query(
      'select id from drivers where company_id = $1 and lower(email) = $2 and deleted_at is null', [company, DRIVER_EMAIL])
    if (!driver.rows[0]) {
      await client.query(`
        insert into drivers (company_id, full_name, rut, email, phone, license_type, status, driver_code)
        values ($1, 'Conductor Demo', 'DEMO-CONDUCTOR', $2, '+56900000001', 'A2', 'available', 'DEMO')
        on conflict (company_id, rut) do update set email = excluded.email, deleted_at = null, status = 'available'`,
        [company, DRIVER_EMAIL])
      ok('Conductor "Conductor Demo" registrado en el panel')
    } else {
      info('Conductor "Conductor Demo" ya existía')
    }
    const driverUser = await ensureAuthUser(client, DRIVER_EMAIL, 'Conductor Demo')
    ok(`Cuenta conductor ${driverUser.created ? 'creada' : 'actualizada'}: ${DRIVER_EMAIL}`)

    // Pasajero listo (ensayo automático y plan B).
    await client.query(`
      insert into passengers (company_id, full_name, rut, email, phone, status)
      values ($1, 'Pasajero Demo', 'DEMO-PASAJERO', $2, '+56900000002', 'active')
      on conflict (company_id, rut) do update set email = excluded.email, deleted_at = null, status = 'active'`,
      [company, PASSENGER_EMAIL])
    const passengerUser = await ensureAuthUser(client, PASSENGER_EMAIL, 'Pasajero Demo')
    ok(`Cuenta pasajero ${passengerUser.created ? 'creada' : 'actualizada'}: ${PASSENGER_EMAIL}`)

    // Cuenta para el paso en vivo "crear pasajero": sin fila en passengers.
    // Al crearlo en el panel (Pasajeros) con este correo, se vincula solo.
    const newUser = await ensureAuthUser(client, NEW_PASSENGER_EMAIL, 'Pasajero Nuevo')
    ok(`Cuenta para habilitar en vivo ${newUser.created ? 'creada' : 'actualizada'}: ${NEW_PASSENGER_EMAIL}`)

    const contract = await client.query(
      `select id from contracts where company_id = $1 and contract_name = $2 and deleted_at is null`, [company, DEMO_CONTRACT])
    if (!contract.rows[0]) {
      await client.query(`
        insert into contracts (company_id, client_name, contract_name, status, start_date)
        values ($1, 'Cliente Demo', $2, 'active', current_date)`, [company, DEMO_CONTRACT])
      ok(`Contrato "${DEMO_CONTRACT}" creado (para asignar al pasajero en vivo)`)
    } else {
      info(`Contrato "${DEMO_CONTRACT}" ya existía`)
    }
    await ensureCrew(client, company)

    if (vehicle) {
      await client.query(`
        insert into vehicles (company_id, plate, brand, model, vehicle_type, year, capacity_passengers, status)
        values ($1, $2, 'Toyota', 'Hiace (demo)', 'van', 2024, 12, 'available')
        on conflict (company_id, plate) do update set deleted_at = null, status = 'available'`,
        [company, DEMO_PLATE])
      ok(`Vehículo ${DEMO_PLATE} disponible`)
    }

    // Vincula por si la fila del conductor/pasajero existía de antes.
    await client.query('select public.link_auth_user_to_mobile_profile($1)', [driverUser.id])
    await client.query('select public.link_auth_user_to_mobile_profile($1)', [passengerUser.id])

    console.log('\nEstado de vinculación')
    const d = await linkStatus(client, DRIVER_EMAIL)
    if (d?.driver_id) ok('Conductor vinculado: puede entrar a la app')
    else fail('El conductor no quedó vinculado')
    const p = await linkStatus(client, PASSENGER_EMAIL)
    if (p?.passenger_id) ok('Pasajero Demo vinculado: puede entrar a la app')
    else fail('El pasajero demo no quedó vinculado')
    const n = await linkStatus(client, NEW_PASSENGER_EMAIL)
    if (n?.passenger_id) info(`${NEW_PASSENGER_EMAIL} ya está vinculado a un pasajero (ya se habilitó antes)`)
    else info(`${NEW_PASSENGER_EMAIL} espera ser habilitado: créalo en el panel (Pasajeros → Añadir Pasajero) con ese correo`)

    console.log(`\nContraseña de las 3 cuentas: ${PASSWORD}  (cámbiala con DEMO_PASSWORD en .env.local)\n`)
  } finally {
    await client.end()
  }
}

// ── reset ─────────────────────────────────────────────────────────────────────

async function reset() {
  const client = await db()
  try {
    const { rows } = await client.query(`
      select s.id, s.service_code, s.status from services s
      where s.deleted_at is null and s.status in ('scheduled', 'in_progress')
        and (
          s.driver_id in (select d.id from drivers d where lower(d.email) = $1)
          or exists (
            select 1 from service_passengers sp join passengers pa on pa.id = sp.passenger_id
            where sp.service_id = s.id and lower(pa.email) = any($2)
          )
        )`, [DRIVER_EMAIL, [PASSENGER_EMAIL, NEW_PASSENGER_EMAIL]])
    console.log(`\nViajes abiertos de las cuentas demo: ${rows.length}`)
    for (const s of rows) {
      await client.query('begin')
      try {
        const { rows: [svc] } = await client.query(`
          update services
          set status = 'cancelled', cancel_reason = 'Reinicio de demo',
              actual_end_at = case when status = 'in_progress' then now() else actual_end_at end
          where id = $1 returning company_id`, [s.id])
        await client.query('select public.release_service_resources(s) from services s where s.id = $1', [s.id])
        await client.query(`
          insert into service_events (company_id, service_id, actor_type, event_type, payload)
          values ($1, $2, 'system', 'service_cancelled', '{"source":"demo_reset","reason":"Reinicio de demo"}')`,
          [svc.company_id, s.id])
        await client.query('commit')
        ok(`${s.service_code} (${s.status}) cancelado`)
      } catch (err) {
        await client.query('rollback')
        fail(`${s.service_code}: ${err.message}`)
      }
    }
    // El contrato demo queda sin pasajeros (baja lógica de su lista).
    const { rowCount: cleared } = await client.query(`
      update contract_passengers set deleted_at = now()
      where deleted_at is null and contract_id in (
        select id from contracts where contract_name = $1 and deleted_at is null)`, [DEMO_CONTRACT])
    if (cleared) ok(`"${DEMO_CONTRACT}" sin pasajeros (${cleared} quitado${cleared === 1 ? '' : 's'})`)
    // Solo queda la cuadrilla fija; el pasajero en vivo se agrega en el panel.
    await ensureCrew(client, await companyId(client))

    // Conductor demo disponible de nuevo aunque haya quedado "en servicio".
    await client.query(`update drivers set status = 'available' where lower(email) = $1 and status = 'in_service'
      and not exists (select 1 from services s where s.driver_id = drivers.id and s.status = 'in_progress' and s.deleted_at is null)`,
      [DRIVER_EMAIL])
    console.log('')
  } finally {
    await client.end()
  }
}

// ── check (ensayo automático) ────────────────────────────────────────────────

function apiClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function signIn(email, password = PASSWORD) {
  const client = apiClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`No se pudo iniciar sesión como ${email}: ${error.message}. ¿Corriste demo:seed?`)
  client.realtime.setAuth(data.session.access_token)
  return client
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const must = async (promise, what) => {
  const { data, error } = await promise
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

function waitFor(predicate, timeoutMs, what) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer)
        resolve(Date.now() - started)
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`No llegó ${what} en ${timeoutMs / 1000} s`))
      }
    }, 100)
  })
}

async function check() {
  await reset()
  console.log('Ensayo automático del flujo real (API de Supabase, mismas funciones y RLS que el panel y la app)\n')

  const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL
  const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Define DEMO_ADMIN_EMAIL y DEMO_ADMIN_PASSWORD en .env.local (cuenta de administrador).')
  }
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
  ok('Admin inició sesión')
  const passenger = await signIn(PASSENGER_EMAIL)
  ok(`Pasajero inició sesión (${PASSENGER_EMAIL})`)
  const driver = await signIn(DRIVER_EMAIL)
  ok(`Conductor inició sesión (${DRIVER_EMAIL})`)

  const { data: { user: driverUser } } = await driver.auth.getUser()
  const driverRow = await must(driver.from('drivers').select('id, company_id').eq('profile_id', driverUser.id).single(), 'Conductor demo')
  const { data: { user: paxUser } } = await passenger.auth.getUser()
  const paxRow = await must(passenger.from('passengers').select('id').eq('profile_id', paxUser.id).single(), 'Pasajero demo')

  // 1. Admin asigna un vehículo al conductor (driver_vehicles).
  const vehicles = await must(admin.from('vehicles').select('id, plate').is('deleted_at', null)
    .eq('status', 'available').order('plate'), 'Vehículos')
  const vehicle = vehicles.find(v => v.plate === DEMO_PLATE) ?? vehicles[0]
  if (!vehicle) throw new Error('No hay vehículos disponibles: crea uno en Flota (o corre demo:seed -- --vehicle).')
  const { error: assignError } = await admin.from('driver_vehicles')
    .insert({ company_id: driverRow.company_id, driver_id: driverRow.id, vehicle_id: vehicle.id })
  if (assignError && assignError.code !== '23505') throw new Error(`Asignar vehículo: ${assignError.message}`)
  ok(`Admin asignó el vehículo ${vehicle.plate} al conductor`)

  // 2. Admin crea el viaje con conductor, vehículo y pasajero.
  const now = new Date(Date.now() + 5 * 60_000)
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {})
  const routeCode = `DEMO-${Date.now().toString(36).toUpperCase().slice(-5)}`
  const serviceId = await must(admin.rpc('admin_create_route_service', {
    p_input: {
      route_code: routeCode, contract_id: null, driver_id: driverRow.id, vehicle_id: vehicle.id,
      scheduled_date: `${local.year}-${local.month}-${local.day}`, scheduled_start_time: `${local.hour}:${local.minute}`,
      origin: DEMO_TRIP.origin, destination: DEMO_TRIP.destination,
      stops: [{ name: 'Recogida pasajero', address: DEMO_TRIP.origin.address, lat: DEMO_TRIP.origin.lat, lng: DEMO_TRIP.origin.lng, passenger_id: paxRow.id }],
    },
  }), 'Crear viaje')
  ok(`Admin creó el viaje ${routeCode} (conductor + ${vehicle.plate} + pasajero)`)

  // 3. Cada uno ve su viaje asignado.
  const drvList = await must(driver.from('services').select('id').eq('driver_id', driverRow.id).eq('status', 'scheduled'), 'Viajes del conductor')
  if (drvList.some(s => s.id === serviceId)) ok('El conductor ve el viaje asignado en su app')
  else fail('El conductor no ve el viaje asignado')
  const paxList = await must(passenger.from('services').select('id, service_passengers!inner(passenger_id)')
    .eq('service_passengers.passenger_id', paxRow.id).in('status', ['scheduled', 'in_progress']), 'Viajes del pasajero')
  if (paxList.some(s => s.id === serviceId)) ok('El pasajero ve el viaje asignado en su app')
  else fail('El pasajero no ve el viaje asignado')

  // Pasajero escucha su viaje en vivo (como PassengerHome / TripTrackingView).
  const seen = { started: false, finished: false, pings: 0 }
  const channel = passenger.channel(`demo-check-${serviceId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'services', filter: `id=eq.${serviceId}` }, ({ new: row }) => {
      if (row.status === 'in_progress') seen.started = true
      if (row.status === 'completed') seen.finished = true
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_locations', filter: `service_id=eq.${serviceId}` }, () => {
      seen.pings += 1
    })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Realtime no respondió (¿tablas en la publicación supabase_realtime?)')), 15000)
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(t); resolve() }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); reject(new Error(`Realtime: ${status}`)) }
    })
  })
  // SUBSCRIBED llega un instante antes de que Realtime reenvíe los cambios.
  await sleep(2000)
  ok('Pasajero suscrito en vivo a su viaje (Realtime)')

  // 4. Inicio + aviso en vivo
  await must(driver.rpc('mobile_start_service', { p_service_id: serviceId, p_odometer_km: null }), 'Iniciar viaje')
  ok('Conductor inició el viaje')
  try {
    const ms = await waitFor(() => seen.started, 10000, 'el aviso de inicio')
    ok(`Pasajero recibió en vivo "Tu conductor inició el viaje" (${ms} ms)`)
  } catch (err) { fail(err.message) }

  // 5. Recorrido simulado (mismo formato que el modo demostración de la app)
  const steps = 6
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    await must(driver.rpc('mobile_report_location', {
      p_service_id: serviceId,
      p_latitude: DEMO_TRIP.origin.lat + (DEMO_TRIP.destination.lat - DEMO_TRIP.origin.lat) * t,
      p_longitude: DEMO_TRIP.origin.lng + (DEMO_TRIP.destination.lng - DEMO_TRIP.origin.lng) * t,
      p_speed_kmh: i === steps ? 0 : 28,
      p_heading: 6,
      p_accuracy_meters: null,
      p_is_simulated: true,
    }), 'Enviar posición')
    await sleep(700)
  }
  try {
    await waitFor(() => seen.pings >= steps + 1, 10000, 'todas las posiciones')
    ok(`Pasajero recibió en vivo ${seen.pings} posiciones del conductor (mapa avanzando)`)
  } catch (err) { fail(`${err.message} (llegaron ${seen.pings})`) }

  // 6. Paradas y cierre
  const stops = await must(driver.from('service_stops').select('id').eq('service_id', serviceId).order('stop_order'), 'Paradas')
  for (const stop of stops) {
    await must(driver.rpc('mobile_set_stop_status', { p_stop_id: stop.id, p_status: 'completed' }), 'Completar parada')
  }
  await must(driver.rpc('mobile_finish_service', { p_service_id: serviceId }), 'Finalizar viaje')
  ok(`Conductor completó ${stops.length} paradas y finalizó el viaje`)
  try {
    await waitFor(() => seen.finished, 10000, 'el aviso de fin')
    ok('Pasajero recibió en vivo "Viaje finalizado"')
  } catch (err) { fail(err.message) }
  await passenger.removeChannel(channel)

  // 7. Auditoría
  const client = await db()
  try {
    const { rows: [m] } = await client.query(`
      select estimated_duration_minutes, actual_duration_minutes, estimated_distance_km, actual_distance_km,
             location_points, anomalies from service_metrics where service_id = $1`, [serviceId])
    if (m) ok(`Métricas consolidadas: duración est. ${m.estimated_duration_minutes} / real ${m.actual_duration_minutes} min · distancia est. ${m.estimated_distance_km} / real ${m.actual_distance_km} km · ${m.location_points} pings · anomalías: ${m.anomalies.join(', ') || 'ninguna'}`)
    else fail('No se consolidaron métricas')
    const { rows: events } = await client.query(
      `select event_type from service_events where service_id = $1 order by created_at`, [serviceId])
    ok(`Bitácora: ${events.map(e => e.event_type).join(' → ')}`)
  } finally {
    await client.end()
  }

  for (const c of [admin, passenger, driver]) await c.auth.signOut()
  console.log(`\n${process.exitCode ? 'El ensayo terminó con errores (ver ✖).' : 'Todo el flujo funciona.'} El viaje ${routeCode} quedó en Panel → Auditoría para revisarlo.\n`)
}

// ── main ──────────────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2)
const commands = {
  seed: () => seed({ vehicle: args.includes('--vehicle') }),
  reset,
  check,
}

if (!commands[command]) {
  console.log('Uso: node scripts/demo.mjs <seed [--vehicle] | check | reset>')
  process.exit(1)
}

commands[command]()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(err => {
    console.error(`\n✖ ${err.message}\n`)
    process.exit(1)
  })
