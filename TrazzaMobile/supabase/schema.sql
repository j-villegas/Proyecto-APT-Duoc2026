-- TRAZZA - Esquema base de datos (Supabase / PostgreSQL)
-- Ejecutar en el SQL editor de Supabase o vía `supabase db push`.

create extension if not exists "uuid-ossp";

create type user_role as enum ('pasajero', 'conductor');
create type service_status as enum ('programado', 'en_espera', 'en_camino', 'en_ruta', 'finalizado', 'cancelado');
create type stop_status as enum ('pendiente', 'confirmada', 'completada');
create type incident_category as enum (
  'frenada_brusca', 'conduccion_imprudente', 'limpieza_unidad', 'retraso_ruta',
  'vehiculo', 'pasajero', 'ruta', 'otro'
);
create type incident_priority as enum ('baja', 'media', 'alta');

-- Perfiles (extiende auth.users)
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role user_role not null default 'pasajero',
  phone text,
  avatar_url text,
  rating numeric(2, 1),
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default uuid_generate_v4(),
  plate text not null unique,
  brand text not null,
  model text not null,
  capacity int not null default 1,
  driver_id uuid references profiles (id) on delete set null
);

create table services (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  contract_name text,
  driver_id uuid not null references profiles (id),
  vehicle_id uuid not null references vehicles (id),
  origin_label text not null,
  origin_address text not null,
  destination_label text not null,
  destination_address text not null,
  origin_latitude double precision,
  origin_longitude double precision,
  destination_latitude double precision,
  destination_longitude double precision,
  scheduled_at timestamptz not null,
  eta timestamptz,
  status service_status not null default 'programado',
  passenger_count int not null default 0,
  created_at timestamptz not null default now()
);

create table service_stops (
  id uuid primary key default uuid_generate_v4(),
  service_id uuid not null references services (id) on delete cascade,
  order_index int not null,
  label text not null,
  address text not null,
  eta timestamptz,
  passenger_count int not null default 0,
  status stop_status not null default 'pendiente'
);

create table trip_passengers (
  id uuid primary key default uuid_generate_v4(),
  service_id uuid not null references services (id) on delete cascade,
  passenger_id uuid not null references profiles (id) on delete cascade,
  pickup_stop_id uuid references service_stops (id),
  unique (service_id, passenger_id)
);

create table driver_locations (
  driver_id uuid primary key references profiles (id) on delete cascade,
  service_id uuid references services (id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  heading double precision,
  speed double precision,
  updated_at timestamptz not null default now()
);

create table incidents (
  id uuid primary key default uuid_generate_v4(),
  service_id uuid references services (id) on delete set null,
  reporter_id uuid not null references profiles (id),
  category incident_category not null,
  title text not null,
  description text not null default '',
  priority incident_priority not null default 'media',
  photo_urls text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

-- Row Level Security ---------------------------------------------------

alter table profiles enable row level security;
alter table vehicles enable row level security;
alter table services enable row level security;
alter table service_stops enable row level security;
alter table trip_passengers enable row level security;
alter table driver_locations enable row level security;
alter table incidents enable row level security;

create policy "Perfiles visibles para autenticados" on profiles
  for select using (auth.role() = 'authenticated');
create policy "Usuario edita su propio perfil" on profiles
  for update using (auth.uid() = id);
-- El usuario solo puede editar sus datos de contacto; role y rating los administra el backend.
revoke update on profiles from authenticated, anon;
grant update (full_name, phone, avatar_url) on profiles to authenticated;

create policy "Vehículos visibles para autenticados" on vehicles
  for select using (auth.role() = 'authenticated');

create policy "Servicios visibles para el conductor asignado" on services
  for select using (
    auth.uid() = driver_id
    or exists (
      select 1 from trip_passengers tp
      where tp.service_id = services.id and tp.passenger_id = auth.uid()
    )
  );
create policy "Conductor actualiza sus servicios" on services
  for update using (auth.uid() = driver_id);

create policy "Paradas visibles según servicio" on service_stops
  for select using (
    exists (
      select 1 from services s
      where s.id = service_stops.service_id
        and (s.driver_id = auth.uid()
          or exists (
            select 1 from trip_passengers tp
            where tp.service_id = s.id and tp.passenger_id = auth.uid()
          ))
    )
  );
create policy "Conductor actualiza paradas de sus servicios" on service_stops
  for update using (
    exists (
      select 1 from services s
      where s.id = service_stops.service_id and s.driver_id = auth.uid()
    )
  );

create policy "Pasajero ve sus asignaciones" on trip_passengers
  for select using (auth.uid() = passenger_id);

create policy "Ubicación visible según servicio" on driver_locations
  for select using (
    auth.uid() = driver_id
    or exists (
      select 1 from trip_passengers tp
      join services s on s.id = tp.service_id
      where s.driver_id = driver_locations.driver_id and tp.passenger_id = auth.uid()
    )
  );
create policy "Conductor actualiza su ubicación" on driver_locations
  for insert with check (auth.uid() = driver_id);
create policy "Conductor sobreescribe su ubicación" on driver_locations
  for update using (auth.uid() = driver_id);

create policy "Incidentes visibles para el reportante" on incidents
  for select using (auth.uid() = reporter_id);
create policy "Cualquier autenticado reporta incidentes" on incidents
  for insert with check (auth.uid() = reporter_id);

-- Realtime ---------------------------------------------------------------
alter publication supabase_realtime add table driver_locations;
alter publication supabase_realtime add table services;
alter publication supabase_realtime add table service_stops;
