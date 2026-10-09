-- Pings de ubicacion GPS durante un servicio. Append-only: sin policy de update.
create table if not exists public.service_locations (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  service_id uuid not null,
  driver_id uuid,
  vehicle_id uuid,
  latitude numeric not null,
  longitude numeric not null,
  speed_kmh numeric,
  heading numeric,
  accuracy_meters numeric,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint service_locations_pkey primary key (id),
  constraint service_locations_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint service_locations_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade,
  constraint service_locations_driver_id_fkey foreign key (driver_id) references public.drivers(id) on delete set null,
  constraint service_locations_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete set null,
  constraint service_locations_latitude_check check (latitude >= -90 and latitude <= 90),
  constraint service_locations_longitude_check check (longitude >= -180 and longitude <= 180)
);

create index if not exists idx_service_locations_company_id on public.service_locations using btree (company_id);
create index if not exists idx_service_locations_service_id on public.service_locations using btree (service_id);
create index if not exists idx_service_locations_recorded_at on public.service_locations using btree (recorded_at desc);
create index if not exists idx_service_locations_service_recorded_at on public.service_locations using btree (service_id, recorded_at desc);

alter table public.service_locations enable row level security;

create policy "service_locations_select_own_company"
  on public.service_locations for select
  using (company_id = current_profile_company_id());

-- Nota: igual que service_events, no exige rol admin (el conductor reporta su propia ubicacion).
create policy "service_locations_admin_insert_own_company"
  on public.service_locations for insert
  with check (company_id = current_profile_company_id());
