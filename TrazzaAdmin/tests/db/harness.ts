import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

// Postgres en memoria con lo mínimo de Supabase (roles, auth, storage,
// publicación de realtime) para correr las migraciones reales del repo.

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url))

export const COMPANY = '00000000-0000-4000-8000-0000000000c1'
export const OTHER_COMPANY = '00000000-0000-4000-8000-0000000000c2'
export const ADMIN_UID = '00000000-0000-4000-8000-0000000000a1'
export const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
export const VEHICLE_ID = '00000000-0000-4000-8000-0000000000e1'
export const ROUTE_ID = '00000000-0000-4000-8000-0000000000f1'
export const PAX_ID = '00000000-0000-4000-8000-0000000000b1'
export const OTHER_PAX_ID = '00000000-0000-4000-8000-0000000000b2'
export const SERVICE_ID = '00000000-0000-4000-8000-000000000051'
export const OTHER_SERVICE_ID = '00000000-0000-4000-8000-000000000052'
export const STOP_IDS = [
  '00000000-0000-4000-8000-000000000071',
  '00000000-0000-4000-8000-000000000072',
  '00000000-0000-4000-8000-000000000073',
]

const SUPABASE_STUBS = `
  set check_function_bodies = off;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
  grant usage on schema auth to authenticated;
  grant execute on all functions in schema auth to authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  create publication supabase_realtime;
`

export async function createDatabase() {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  for (const file of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(`begin;${readFileSync(MIGRATIONS_DIR + file, 'utf8')};commit;`)
    } catch (err) {
      throw new Error(`La migración ${file} falló: ${(err as Error).message}`)
    }
  }
  return db
}

/** Empresa con admin, conductor, dos pasajeros, vehículo, ruta y dos servicios. */
export async function seed(db: PGlite) {
  await db.exec(`
    insert into companies (id, name) values ('${COMPANY}', 'Trazza'), ('${OTHER_COMPANY}', 'Otra');
    insert into auth.users (id, email) values ('${ADMIN_UID}', 'admin@trazza.cl');
    insert into profiles (id, company_id, full_name, email, role) values ('${ADMIN_UID}', '${COMPANY}', 'Admin', 'admin@trazza.cl', 'admin');
    insert into drivers (id, company_id, full_name, rut, email, phone) values
      ('${DRIVER_ID}', '${COMPANY}', 'Carlos Mendoza', '1-9', 'Carlos@Trazza.cl', '+569222');
    insert into passengers (id, company_id, full_name, rut, email) values
      ('${PAX_ID}', '${COMPANY}', 'Juan Marchant', '2-7', 'juan@trazza.cl'),
      ('${OTHER_PAX_ID}', '${COMPANY}', 'Otra Persona', '3-5', 'otra@trazza.cl');
    insert into vehicles (id, company_id, plate, vehicle_type, capacity_passengers) values
      ('${VEHICLE_ID}', '${COMPANY}', 'ABCD12', 'van', 15);
    insert into routes (id, company_id, route_code, name, origin_name, origin_latitude, destination_name) values
      ('${ROUTE_ID}', '${COMPANY}', 'R1', 'Ruta 1', 'Planta', -33.5, 'Mall');
    insert into services (id, company_id, route_id, service_code, scheduled_date, scheduled_start_time, scheduled_end_time, driver_id, vehicle_id) values
      ('${SERVICE_ID}', '${COMPANY}', '${ROUTE_ID}', 'S1', '2026-10-09', '08:30', '09:15', '${DRIVER_ID}', '${VEHICLE_ID}'),
      ('${OTHER_SERVICE_ID}', '${COMPANY}', null, 'S2', '2026-10-09', '18:00', null, null, null);
    insert into service_stops (id, company_id, service_id, stop_order, stop_type, name, planned_arrival_time) values
      ('${STOP_IDS[0]}', '${COMPANY}', '${SERVICE_ID}', 1, 'origin', 'Planta', '08:30'),
      ('${STOP_IDS[1]}', '${COMPANY}', '${SERVICE_ID}', 2, 'pickup', 'Paradero', '08:45'),
      ('${STOP_IDS[2]}', '${COMPANY}', '${SERVICE_ID}', 3, 'destination', 'Mall', '09:15');
    insert into service_passengers (company_id, service_id, passenger_id, service_stop_id) values
      ('${COMPANY}', '${SERVICE_ID}', '${PAX_ID}', '${STOP_IDS[1]}'),
      ('${COMPANY}', '${SERVICE_ID}', '${OTHER_PAX_ID}', '${STOP_IDS[1]}'),
      ('${COMPANY}', '${OTHER_SERVICE_ID}', '${OTHER_PAX_ID}', null);
  `)
}

/** Crea un usuario de Auth (dispara la vinculación automática de 025) y devuelve su id. */
export async function createAuthUser(db: PGlite, email: string) {
  const { rows } = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email])
  return rows[0].id
}

/** Ejecuta `fn` como un usuario autenticado (RLS activo, auth.uid() = uid). */
export async function asUser<T>(db: PGlite, uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

export async function rows<T = Record<string, unknown>>(db: PGlite, sql: string, params?: unknown[]) {
  return (await db.query<T>(sql, params)).rows
}

export async function one<T = Record<string, unknown>>(db: PGlite, sql: string, params?: unknown[]) {
  return (await rows<T>(db, sql, params))[0]
}
