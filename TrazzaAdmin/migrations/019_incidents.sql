create table if not exists public.incidents (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  incident_code text,
  service_id uuid,
  route_id uuid,
  vehicle_id uuid,
  driver_id uuid,
  passenger_id uuid,
  service_stop_id uuid,
  incident_type_id uuid,
  reported_by_type text not null,
  reported_by_profile_id uuid,
  reported_by_driver_id uuid,
  reported_by_passenger_id uuid,
  severity text not null default 'medium',
  status text not null default 'open',
  title text,
  description text,
  latitude numeric,
  longitude numeric,
  occurred_at timestamptz not null default now(),
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint incidents_pkey primary key (id),
  constraint incidents_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint incidents_service_id_fkey foreign key (service_id) references public.services(id) on delete set null,
  constraint incidents_route_id_fkey foreign key (route_id) references public.routes(id) on delete set null,
  constraint incidents_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete set null,
  constraint incidents_driver_id_fkey foreign key (driver_id) references public.drivers(id) on delete set null,
  constraint incidents_passenger_id_fkey foreign key (passenger_id) references public.passengers(id) on delete set null,
  constraint incidents_service_stop_id_fkey foreign key (service_stop_id) references public.service_stops(id) on delete set null,
  constraint incidents_incident_type_id_fkey foreign key (incident_type_id) references public.incident_types(id) on delete set null,
  constraint incidents_reported_by_profile_id_fkey foreign key (reported_by_profile_id) references public.profiles(id) on delete set null,
  constraint incidents_reported_by_driver_id_fkey foreign key (reported_by_driver_id) references public.drivers(id) on delete set null,
  constraint incidents_reported_by_passenger_id_fkey foreign key (reported_by_passenger_id) references public.passengers(id) on delete set null,
  constraint incidents_reported_by_type_check check (reported_by_type in ('admin', 'driver', 'passenger', 'system')),
  constraint incidents_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  constraint incidents_status_check check (status in ('open', 'in_review', 'resolved', 'cancelled')),
  constraint incidents_latitude_check check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint incidents_longitude_check check (longitude is null or (longitude >= -180 and longitude <= 180)),
  constraint incidents_unique_code_per_company unique (company_id, incident_code)
);

create index if not exists idx_incidents_company_id on public.incidents using btree (company_id);
create index if not exists idx_incidents_service_id on public.incidents using btree (service_id);
create index if not exists idx_incidents_route_id on public.incidents using btree (route_id);
create index if not exists idx_incidents_vehicle_id on public.incidents using btree (vehicle_id);
create index if not exists idx_incidents_driver_id on public.incidents using btree (driver_id);
create index if not exists idx_incidents_passenger_id on public.incidents using btree (passenger_id);
create index if not exists idx_incidents_type_id on public.incidents using btree (incident_type_id);
create index if not exists idx_incidents_status on public.incidents using btree (status) where (deleted_at is null);
create index if not exists idx_incidents_severity on public.incidents using btree (severity) where (deleted_at is null);
create index if not exists idx_incidents_occurred_at on public.incidents using btree (occurred_at desc);

create trigger set_incidents_updated_at
  before update on public.incidents
  for each row
  execute function public.set_updated_at();

alter table public.incidents enable row level security;

create policy "incidents_select_own_company"
  on public.incidents for select
  using (company_id = current_profile_company_id());

-- Nota: a diferencia del resto, no exige rol admin (conductores y pasajeros tambien reportan incidentes).
create policy "incidents_insert_own_company"
  on public.incidents for insert
  with check (company_id = current_profile_company_id());

create policy "incidents_admin_update_own_company"
  on public.incidents for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
