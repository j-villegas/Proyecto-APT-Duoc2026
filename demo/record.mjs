// Graba el flujo principal sobre la app REAL corriendo en local:
//   - Panel Admin (Next.js)        http://localhost:3000
//   - App móvil en web (Expo)      http://localhost:8081  (Pasajero y Conductor)
//
// Flujo real de operación: el Admin registra al pasajero, crea un vehículo, se
// lo asigna al conductor y crea el viaje → conductor y pasajero lo ven en su
// app → el conductor lo inicia (aviso en vivo al pasajero, avance en el mapa)
// → el Admin lo audita.
//
// Tres sesiones de navegador independientes (Admin, Pasajero, Conductor), cada
// una grabada por separado con Playwright. Se anota la hora de cada paso en
// raw/timeline.json para que compose.mjs arme las escenas sincronizadas.
// También guarda capturas reales de cada momento clave en capturas/.
//
// Requisitos (ver README.md): panel y app corriendo, `npm run demo:seed` en
// TrazzaAdmin, y DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD en TrazzaAdmin/.env.local.

import { chromium } from 'playwright'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAW = join(HERE, 'raw')
const SHOTS = join(HERE, 'capturas')

// ── Configuración ─────────────────────────────────────────────────────────────

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8').split(/\r?\n/)
      .filter(l => /^[A-Z0-9_]+=/.test(l))
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
}
const env = { ...readEnvFile(join(HERE, '../TrazzaAdmin/.env.local')), ...process.env }

const ADMIN_URL = env.DEMO_ADMIN_URL || 'http://localhost:3000'
const APP_URL = env.DEMO_APP_URL || 'http://localhost:8081'
const PASSWORD = env.DEMO_PASSWORD || 'TrazzaDemo2026'
const DRIVER_EMAIL = env.DEMO_DRIVER_EMAIL || 'conductor.demo@demo.trazza.cl'
const DRIVER_NAME = 'Conductor Demo'
const CONTRACT_LABEL = 'Contrato Demo'
// Cuenta creada por demo:seed que se habilita en vivo al registrar al pasajero.
const PASSENGER_EMAIL = env.DEMO_NEW_PASSENGER_EMAIL || 'pasajero.nuevo@demo.trazza.cl'
const ADMIN_EMAIL = env.DEMO_ADMIN_EMAIL
const ADMIN_PASSWORD = env.DEMO_ADMIN_PASSWORD
// Duración del recorrido simulado: la misma EXPO_PUBLIC_DEMO_SIM_MINUTES con
// que se levantó Expo.
const SIM_MS = Number(env.DEMO_SIM_MINUTES || 0.9) * 60_000

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Falta DEMO_ADMIN_EMAIL y/o DEMO_ADMIN_PASSWORD en TrazzaAdmin/.env.local (tu cuenta de administrador).')
  process.exit(1)
}

// Transporte de personal en Antofagasta (contexto minero): el conductor sale
// de su base, recoge a la cuadrilla (cada uno en una calle distinta, a varias
// cuadras), deja a todos en el mismo destino y vuelve a la base. El panel
// calcula el camino por calles (Directions) y el GPS simulado lo recorre.
const TRIP = {
  origin: 'Avenida Argentina 2400, Antofagasta',   // base del conductor (salida y regreso)
  destination: 'Puerto Antofagasta',               // destino común de la cuadrilla
}
// Recogida de cada integrante, en el orden del contrato (Pedro y Camila son la
// cuadrilla fija de demo:seed; Ana se registra en vivo y va al final).
const PICKUPS = [
  ['Pedro Soto', 'Parque Brasil, Antofagasta'],
  ['Camila Díaz', 'Mercado Central de Antofagasta'],
  ['Ana Rojas', 'Plaza Colón, Antofagasta'],
]
// Posición de Google Places para el origen (Av. Argentina 2400).
const ORIGIN_GEO = { latitude: -23.65412, longitude: -70.39453 }

// Datos nuevos en cada grabación (patente, RUT y código no pueden repetirse).
const rnd = n => Math.floor(Math.random() * n)
const LETTERS = 'BCDFGHJKLPRSTVWXYZ'
const PLATE = `${LETTERS[rnd(18)]}${LETTERS[rnd(18)]}-${LETTERS[rnd(18)]}${LETTERS[rnd(18)]}-${String(10 + rnd(90))}`
const PLATE_SHOWN = PLATE.replace(/-/g, '·')
function rutWithDv(body) {
  let sum = 0
  let mul = 2
  for (const d of String(body).split('').reverse()) {
    sum += Number(d) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const dv = 11 - (sum % 11)
  return `${body.toLocaleString('es-CL')}-${dv === 11 ? '0' : dv === 10 ? 'K' : dv}`
}
const RUT = rutWithDv(20_000_000 + rnd(4_000_000))
const PASSENGER_NAME = 'Ana Rojas'
const ROUTE_CODE = `R-ANT-${String(100 + rnd(900))}`

/** Fecha y hora local de Chile + `minutes`, en formato de <input type="datetime-local">. */
function chileLocal(minutes) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + minutes * 60_000)).reduce((a, p) => ({ ...a, [p.type]: p.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

// ── Utilidades ────────────────────────────────────────────────────────────────

const T0 = Date.now()
const timeline = { startedAt: T0, videos: {}, marks: [], data: { plate: PLATE, rut: RUT, routeCode: ROUTE_CODE } }
const mark = (name, caption) => {
  timeline.marks.push({ name, caption, t: Date.now() - T0 })
  console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${name}${caption ? ` — ${caption}` : ''}`)
}
const pause = ms => new Promise(r => setTimeout(r, ms))
let shotN = 0
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`) })

rmSync(RAW, { recursive: true, force: true })
rmSync(SHOTS, { recursive: true, force: true })
mkdirSync(RAW, { recursive: true })
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
// Antofagasta (base de la empresa): la app pide la ubicación del teléfono.
const GEO = { geolocation: { latitude: -23.6466, longitude: -70.3979 }, permissions: ['geolocation'] }

async function openSession(role, viewport, extra = {}) {
  const dir = join(RAW, role)
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 1, locale: 'es-CL', timezoneId: 'America/Santiago',
    recordVideo: { dir, size: viewport }, ...extra,
  })
  // Solo en la grabación: oculta el indicador de desarrollo de Next.js ("N",
  // "Rendering…"), que no es parte de la app.
  await context.addInitScript(() => {
    const style = () => {
      const s = document.createElement('style')
      s.textContent = 'nextjs-portal{display:none!important}'
      document.head.appendChild(s)
    }
    if (document.head) style()
    else document.addEventListener('DOMContentLoaded', style)
  })
  const page = await context.newPage()
  timeline.videos[role] = { start: Date.now() - T0, dir, viewport }
  page.on('pageerror', e => {
    if (!/IntersectionObserver/.test(e.message)) console.warn(`[${role}] error de página:`, e.message.slice(0, 160))
  })
  return { context, page }
}

/** Escribe como una persona (visible en el video). */
const typeInto = async (locator, text, delay = 35) => {
  await locator.click()
  await locator.pressSequentially(text, { delay })
}

const MOBILE = { width: 390, height: 844 }
const admin = await openSession('admin', { width: 1440, height: 900 })
const pax = await openSession('pasajero', MOBILE, GEO)
// El conductor parte en el origen del viaje: así el GPS simulado no "salta"
// desde otro punto al empezar.
const drv = await openSession('conductor', MOBILE, { ...GEO, geolocation: ORIGIN_GEO })

// Todo carga mientras tanto (no se muestra en el video).
await Promise.all([
  admin.page.goto(`${ADMIN_URL}/login`, { waitUntil: 'networkidle' }),
  pax.page.goto(APP_URL, { waitUntil: 'networkidle' }),
  drv.page.goto(APP_URL, { waitUntil: 'networkidle' }),
])
await pause(1500)

try {
  const a = admin.page
  const p = pax.page
  const d = drv.page

  /** Elige la primera sugerencia de Google Places para un campo del panel. */
  const pickPlace = async (input, text) => {
    await typeInto(input, text, 30)
    const item = a.locator('.pac-container').filter({ visible: true }).locator('.pac-item').first()
    await item.waitFor({ state: 'visible', timeout: 15000 })
    await pause(400)
    // Selección con teclado (el fondo del modal intercepta el puntero sobre la
    // lista de Google). Solo en la grabación: Enter en estos campos no envía
    // el formulario; Google igual recibe la tecla y elige la sugerencia.
    await a.evaluate(() => {
      if (window.__pacEnterGuard) return
      window.__pacEnterGuard = true
      document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.classList.contains('pac-target-input')) e.preventDefault()
      }, true)
    })
    await input.press('ArrowDown')
    await pause(200)
    await input.press('Enter')
    await a.locator('.pac-container').filter({ visible: true }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    await pause(600)
  }
  const sidebar = name => a.getByRole('link', { name, exact: true })

  // ── Escena 1: Admin ─────────────────────────────────────────────────────────
  mark('admin:start', 'Panel Admin: inicio de sesión')
  await typeInto(a.locator('#email'), ADMIN_EMAIL, 25)
  await typeInto(a.locator('#password'), ADMIN_PASSWORD, 20)
  await a.getByRole('button', { name: 'Iniciar sesión' }).click()
  await a.waitForURL('**/dashboard', { timeout: 30000 })
  await a.waitForLoadState('networkidle')
  await pause(1200)
  await shot(a, 'admin-dashboard')

  mark('admin:passenger', 'Admin registra al pasajero con su correo de acceso y su contrato')
  await sidebar('Pasajeros').click()
  await a.waitForURL('**/pasajeros')
  await a.waitForLoadState('networkidle')
  await pause(800)
  await a.getByRole('button', { name: 'Añadir Pasajero' }).click()
  const pm = a.getByRole('dialog')
  await typeInto(pm.getByPlaceholder('Juan Pérez'), PASSENGER_NAME)
  await typeInto(pm.getByPlaceholder('12.345.678-9'), RUT)
  await typeInto(pm.getByPlaceholder('pasajero@empresa.cl'), PASSENGER_EMAIL, 20)
  await pm.locator('label').filter({ hasText: CONTRACT_LABEL }).locator('input[type=checkbox]').check()
  await pause(500)
  await shot(a, 'admin-pasajero-form')
  await pm.getByRole('button', { name: 'Guardar Pasajero' }).click()
  await pm.waitFor({ state: 'detached', timeout: 20000 })
  const paxRow = a.locator('tr').filter({ hasText: RUT })
  await paxRow.waitFor({ timeout: 20000 })
  await paxRow.scrollIntoViewIfNeeded()
  await paxRow.getByText('Con acceso').waitFor({ timeout: 20000 })
  await pause(1500)
  await shot(a, 'admin-pasajero-creado')

  mark('admin:vehicle', 'Admin crea un vehículo en Flota')
  await sidebar('Flota').click()
  await a.waitForURL('**/flota')
  await a.waitForLoadState('networkidle')
  await pause(800)
  await a.getByRole('button', { name: 'Añadir Vehículo' }).click()
  const vm = a.locator('form').filter({ hasText: 'Patente' })
  await typeInto(vm.getByPlaceholder('LL-PP-24'), PLATE)
  await typeInto(vm.getByPlaceholder('Mercedes-Benz'), 'Toyota')
  await typeInto(vm.getByPlaceholder('Sprinter 516'), 'Hiace')
  await vm.locator('select').nth(0).selectOption('van')
  // Capacidad: primer campo con placeholder exactamente "0" ("2023" también contiene un 0).
  await typeInto(vm.getByPlaceholder('0', { exact: true }).first(), '12')
  await vm.locator('select').nth(1).selectOption('available')
  await pause(400)
  await shot(a, 'admin-vehiculo-form')
  await vm.getByRole('button', { name: /Guardar Vehículo/ }).click()
  await vm.waitFor({ state: 'detached', timeout: 20000 })
  await a.getByText(PLATE_SHOWN).or(a.getByText(PLATE)).first().waitFor({ timeout: 20000 })
  await pause(1200)

  mark('admin:assign', 'Admin asigna el vehículo al conductor (un conductor puede tener varios)')
  await sidebar('Conductores').click()
  await a.waitForURL('**/conductores')
  await a.waitForLoadState('networkidle')
  await pause(800)
  await a.locator('tr').filter({ hasText: DRIVER_NAME }).getByRole('button', { name: 'Ver detalle' }).click()
  await a.getByText('Vehículos asignados', { exact: true }).waitFor({ timeout: 15000 })
  const vehicleOption = a.locator('label').filter({ hasText: PLATE_SHOWN })
  await vehicleOption.waitFor({ timeout: 15000 })
  await vehicleOption.scrollIntoViewIfNeeded()
  await pause(600)
  // La casilla se marca cuando termina de guardarse (no al instante).
  const vehicleBox = vehicleOption.locator('input[type=checkbox]')
  if (!(await vehicleBox.isChecked())) await vehicleBox.click()
  const assignedBy = Date.now() + 15000
  while (!(await vehicleBox.isChecked())) {
    if (Date.now() > assignedBy) throw new Error('No se pudo asignar el vehículo al conductor')
    await pause(200)
  }
  await pause(1500)
  await shot(a, 'admin-vehiculo-asignado')
  await a.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await pause(500)

  mark('admin:trip', 'Admin crea el viaje: base, recogida de cada pasajero, destino común y regreso a la base')
  await sidebar('Rutas').click()
  await a.waitForURL('**/rutas')
  await a.waitForLoadState('networkidle')
  await pause(800)
  await a.getByRole('button', { name: 'Añadir Nueva Ruta' }).click()
  const rm = a.locator('form').filter({ hasText: 'Contrato Activo' })
  await rm.waitFor()
  const selects = rm.locator('select')
  await pause(1200) // carga de contratos, conductores y vehículos
  await selects.nth(0).selectOption({ label: `Cliente Demo · ${CONTRACT_LABEL}` })
  await typeInto(rm.getByPlaceholder('Ej: R-ANT-001'), ROUTE_CODE)
  await selects.nth(1).selectOption({ label: DRIVER_NAME })
  await pause(500)
  // El vehículo recién asignado aparece en "Asignados al conductor".
  const vehicleSelect = selects.nth(2)
  const vehicleValue = await vehicleSelect.locator('option', { hasText: PLATE }).first().getAttribute('value')
  await vehicleSelect.selectOption(vehicleValue)
  await pickPlace(rm.getByPlaceholder('Base o punto de partida del conductor'), TRIP.origin)
  await pickPlace(rm.getByPlaceholder('Faena, planta u oficina de destino'), TRIP.destination)
  await rm.locator('input[type="datetime-local"]').fill(chileLocal(2))
  // "El conductor regresa a la base al terminar" viene marcado por defecto.
  for (const [name, place] of PICKUPS) {
    const row = rm.locator('div.flex.items-center.gap-2').filter({ hasText: name })
    await pickPlace(row.getByPlaceholder('Recogida: dónde lo busca el conductor'), place)
  }
  await pause(600)
  await shot(a, 'admin-viaje-form')
  await rm.getByRole('button', { name: /Crear Ruta/ }).click()
  await rm.waitFor({ state: 'detached', timeout: 45000 })
  await a.waitForLoadState('networkidle')
  await pause(1800)
  await shot(a, 'admin-viaje-creado')
  mark('admin:end')

  // ── Escena 2: móviles ───────────────────────────────────────────────────────
  const mobileLogin = async (page, email) => {
    await typeInto(page.getByRole('textbox', { name: 'Correo electrónico' }), email, 20)
    await typeInto(page.getByRole('textbox', { name: 'Contraseña', exact: true }), PASSWORD, 20)
    await page.getByText('Iniciar sesión', { exact: true }).click()
  }

  mark('mobile:start', 'Pasajero y conductor inician sesión en la app')
  await Promise.all([mobileLogin(p, PASSENGER_EMAIL), mobileLogin(d, DRIVER_EMAIL)])
  await Promise.all([
    p.getByText('Ver detalle del viaje').waitFor({ timeout: 30000 }),
    d.getByText(ROUTE_CODE).first().waitFor({ timeout: 30000 }),
  ])
  mark('mobile:assigned', 'Cada uno ve el viaje que le asignó la central')
  await pause(2500)
  await shot(p, 'pasajero-viaje-asignado')
  await shot(d, 'conductor-viaje-asignado')

  // Pasajero: detalle → seguimiento.  Conductor: ver ruta → preparar.
  await p.getByText('Ver detalle del viaje').click()
  await d.getByText('Ver ruta', { exact: true }).click()
  await p.getByText('Estoy listo en el punto').waitFor({ timeout: 20000 })
  await pause(1800)
  await shot(p, 'pasajero-detalle')
  await p.getByText('Estoy listo en el punto').click()
  await p.getByText('Estado del Viaje').waitFor()

  mark('drv:prepare', 'El conductor revisa el vehículo e inicia el viaje')
  await d.getByText('Preparar ruta').click()
  await d.getByPlaceholder('Ej: 45000').waitFor()
  await typeInto(d.getByPlaceholder('Ej: 45000'), '45200', 40)
  for (const label of ['Vehículo verificado', 'Documentos al día', 'Combustible revisado', 'Ruta revisada']) {
    await d.getByText(label, { exact: true }).click()
    await pause(200)
  }
  await shot(d, 'conductor-preparar')
  await d.getByText('Iniciar ruta', { exact: true }).click()

  // El aviso aparece en el seguimiento (y en el inicio, que queda debajo): se espera el visible.
  await p.getByText('Tu conductor inició el viaje').filter({ visible: true }).first().waitFor({ timeout: 20000 })
  mark('pax:started', 'Notificación en tiempo real al pasajero: “Tu conductor inició el viaje”')
  await pause(800)
  await shot(p, 'pasajero-aviso-inicio')
  await pause(2000)

  // Al iniciar, el origen queda como salida: la primera parada es la primera recogida.
  const visible = (page, text, opts) => page.getByText(text, opts).filter({ visible: true }).first()
  await visible(d, 'Recoger a Pedro Soto').waitFor({ timeout: 20000 })
  await visible(p, 'El conductor va a buscarte').waitFor({ timeout: 20000 })
  mark('tracking', 'El conductor sale de la base a buscar a la cuadrilla: Ana ve que hay 2 paradas antes que ella')
  await d.getByRole('switch').click() // modo demostración: GPS simulado por la ruta planificada

  // Toca el botón de la parada cuando el conductor llega ("Llegando") y espera
  // a que la tarjeta pase a la parada siguiente (sin "Llegando"), para no
  // leer el aviso de la parada anterior.
  const arriveAndTap = async (button) => {
    await visible(d, 'Llegando').waitFor({ timeout: SIM_MS + 60000 })
    await pause(700)
    await visible(d, button, { exact: true }).click()
    const until = Date.now() + 20000
    while ((await d.getByText('Llegando').filter({ visible: true }).count()) > 0) {
      if (Date.now() > until) throw new Error(`La parada no avanzó tras "${button}"`)
      await pause(250)
    }
  }

  await pause(SIM_MS * 0.08)
  await shot(p, 'pasajero-espera')
  await shot(d, 'conductor-va-a-recoger-1')
  await arriveAndTap('Pasajero a bordo')
  mark('pickup:1', 'Recoge a Pedro y sigue con Camila')
  await arriveAndTap('Pasajero a bordo')
  mark('pickup:2', 'Recoge a Camila; ahora va a buscar a Ana')
  await pause(SIM_MS * 0.05)
  await shot(p, 'pasajero-conductor-va-a-buscar')
  await shot(d, 'conductor-va-a-recoger-3')
  await arriveAndTap('Pasajero a bordo')
  await visible(p, 'A bordo · camino a tu destino').waitFor({ timeout: 20000 })
  mark('pax:onboard', 'Cuadrilla completa a bordo: van todos al mismo destino')
  await pause(SIM_MS * 0.08)
  await shot(p, 'pasajero-a-bordo')
  await shot(d, 'conductor-va-al-destino')
  await arriveAndTap('Llegué al destino')
  await visible(p, 'Llegaste a tu destino').waitFor({ timeout: 20000 })
  mark('pax:dropoff', 'Todos bajan en el destino; el conductor regresa a la base')
  await shot(p, 'pasajero-llego')
  await pause(SIM_MS * 0.06)
  await shot(d, 'conductor-regresa-a-base')

  await visible(d, 'Llegando').waitFor({ timeout: SIM_MS + 60000 })
  mark('drv:finish', 'El conductor llega a la base y finaliza el viaje')
  await pause(700)
  await visible(d, 'Llegué a la base', { exact: true }).click()
  await d.getByText('Ruta finalizada').waitFor({ timeout: 20000 })
  await p.getByText('Gracias por viajar con nosotros.').filter({ visible: true }).first().waitFor({ timeout: 20000 })
  await pause(800)
  await shot(p, 'pasajero-finalizado')
  await shot(d, 'conductor-finalizado')
  await pause(2500)
  mark('mobile:end')

  // ── Escena 3: auditoría ─────────────────────────────────────────────────────
  await a.goto(`${ADMIN_URL}/dashboard/auditoria`, { waitUntil: 'networkidle' })
  mark('audit:list', 'Admin › Auditoría: el servicio quedó registrado')
  await pause(2500)
  await shot(a, 'auditoria-lista')
  await a.getByRole('link', { name: ROUTE_CODE }).first().click()
  await a.waitForURL('**/auditoria/**')
  await a.waitForLoadState('networkidle')
  mark('audit:detail', 'Línea de vida, estimado vs. real, trayectoria GPS y bitácora inmutable')
  await pause(3000)
  await shot(a, 'auditoria-detalle')
  const main = a.locator('main')
  const scroll = async (y, wait) => {
    await main.evaluate((el, top) => el.scrollTo({ top, behavior: 'smooth' }), y)
    await pause(wait)
  }
  await scroll(800, 3500)
  await shot(a, 'auditoria-trayectoria')
  await scroll(0, 1500)

  mark('audit:approve', 'El Admin revisa y marca el servicio como auditado (Aprobado)')
  await typeInto(a.getByPlaceholder(/Obligatorio para dejar observado/), 'Revisado: tiempos y recorrido conformes.', 18)
  await a.getByRole('button', { name: 'Aprobar' }).click()
  await a.getByText('Servicio aprobado.').waitFor({ timeout: 20000 })
  // Espera a que la página se actualice: estado "Aprobado" e historial con la decisión.
  await a.getByText('Aprobado', { exact: true }).first().waitFor({ timeout: 30000 })
  await a.getByText(/^por /).first().waitFor({ timeout: 30000 })
  await pause(2000)
  await shot(a, 'auditoria-aprobada')
  await pause(2000)
  mark('audit:end')
} catch (err) {
  console.error('\n✖ La grabación se detuvo:', err.message.split('\n')[0])
  for (const [role, s] of Object.entries({ admin, pasajero: pax, conductor: drv })) {
    await s.page.screenshot({ path: join(SHOTS, `error-${role}.png`) }).catch(() => {})
  }
  process.exitCode = 1
} finally {
  for (const [role, s] of Object.entries({ admin, pasajero: pax, conductor: drv })) {
    const video = s.page.video()
    await s.context.close()
    timeline.videos[role].file = await video.path()
  }
  await browser.close()
  writeFileSync(join(RAW, 'timeline.json'), JSON.stringify(timeline, null, 2))
  console.log(`\nVideos crudos y timeline en ${RAW}`)
}
