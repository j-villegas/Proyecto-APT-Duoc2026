// Corre las migraciones pendientes de migrations/ contra la base de datos
// real de Supabase (conexion directa por Postgres, sin CLI de Supabase).
//
// Uso: npm run db:migrate
// Requiere DATABASE_URL en .env.local (Project Settings -> Database ->
// Connection string -> URI, conexion directa, no el pooler).

import { readdirSync, readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url)

// Estas tablas ya existian en produccion (se crearon a mano en el Table
// Editor) antes de que este runner existiera. Si la base ya las tiene, se
// marcan como aplicadas sin ejecutarlas. Si la base esta vacia (ej. un
// proyecto nuevo), se ejecutan igual que cualquier otra migracion.
// Lista explicita en vez de un corte por comparacion de texto de nombre de
// archivo: agregar/renumerar una migracion no puede alterar silenciosamente
// que se considera "ya aplicado".
const BASELINE_FILES = new Set([
  '001_shared_functions.sql',
  '002_companies.sql',
  '003_profiles.sql',
  '004_contracts.sql',
  '005_drivers.sql',
  '006_vehicles.sql',
  '007_passengers.sql',
  '008_routes.sql',
  '009_route_stops.sql',
  '010_route_passengers.sql',
  '011_route_schedules.sql',
  '012_services.sql',
  '013_service_stops.sql',
  '014_service_passengers.sql',
  '015_service_events.sql',
  '016_service_locations.sql',
  '017_passenger_service_access.sql',
  '018_incident_types.sql',
  '019_incidents.sql',
  '020_maintenance_orders.sql',
  '021_fuel_logs.sql',
  '022_operational_alerts.sql',
  '023_audit_logs.sql',
])
const BASELINE_PROBE_TABLE = 'companies'

function loadMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort()
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `)
}

async function getAppliedFilenames(client) {
  const { rows } = await client.query('select filename from public.schema_migrations')
  return new Set(rows.map(r => r.filename))
}

async function baselineAlreadyExists(client) {
  const { rows } = await client.query('select to_regclass($1) is not null as exists', [
    `public.${BASELINE_PROBE_TABLE}`,
  ])
  return rows[0].exists
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL en el entorno. Agrégalo a .env.local (Supabase -> Project Settings -> Database -> Connection string -> URI).')
    process.exit(1)
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    await ensureMigrationsTable(client)
    const applied = await getAppliedFilenames(client)
    const files = loadMigrationFiles()

    if (applied.size === 0 && (await baselineAlreadyExists(client))) {
      const baseline = files.filter(f => BASELINE_FILES.has(f))
      console.log(`Base existente detectada (tabla "${BASELINE_PROBE_TABLE}" ya existe).`)
      console.log(`Marcando como aplicadas sin ejecutar: ${baseline.length} archivo(s).`)
      for (const filename of baseline) {
        await client.query('insert into public.schema_migrations (filename) values ($1)', [filename])
        applied.add(filename)
      }
    }

    const pending = files.filter(f => !applied.has(f))
    if (pending.length === 0) {
      console.log('Nada pendiente. La base está al día.')
      return
    }

    for (const filename of pending) {
      const sql = readFileSync(new URL(filename, MIGRATIONS_DIR), 'utf8')
      process.stdout.write(`Aplicando ${filename}... `)
      try {
        await client.query('begin')
        await client.query(sql)
        await client.query('insert into public.schema_migrations (filename) values ($1)', [filename])
        await client.query('commit')
        console.log('ok')
      } catch (err) {
        await client.query('rollback')
        console.log('FALLÓ')
        throw err
      }
    }

    console.log(`Listo. ${pending.length} migración(es) aplicada(s).`)
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
