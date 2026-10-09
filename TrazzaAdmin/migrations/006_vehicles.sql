create table if not exists public.vehicles (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  plate text not null,
  brand text,
  model text,
  vehicle_type text not null,
  year int4,
  capacity_passengers int4,
  status text not null default 'available',
  current_odometer_km numeric,
  next_maintenance_km numeric,
  estimated_fuel_efficiency_km_l numeric,
  fuel_type text,
  tank_capacity_liters numeric,
  base_location text,
  technical_review_expires_at date,
  circulation_permit_expires_at date,
  insurance_expires_at date,
  insurance_policy_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint vehicles_pkey primary key (id),
  constraint vehicles_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint vehicles_capacity_check check (capacity_passengers is null or capacity_passengers >= 0),
  constraint vehicles_fuel_type_check check (fuel_type is null or fuel_type in ('diesel', 'gasoline_93', 'gasoline_95', 'gasoline_97', 'electric', 'hybrid', 'other')),
  constraint vehicles_status_check check (status in ('available', 'in_service', 'maintenance', 'out_of_service')),
  constraint vehicles_type_check check (vehicle_type in ('bus', 'minibus', 'van', 'furgon', 'truck', 'other')),
  constraint vehicles_unique_plate_per_company unique (company_id, plate),
  constraint vehicles_year_check check (year is null or (year >= 1980 and year <= 2100))
);

create index if not exists idx_vehicles_company_id on public.vehicles using btree (company_id);
create index if not exists idx_vehicles_status on public.vehicles using btree (status) where (deleted_at is null);
create index if not exists idx_vehicles_plate on public.vehicles using btree (plate);

create trigger set_vehicles_updated_at
  before update on public.vehicles
  for each row
  execute function public.set_updated_at();

alter table public.vehicles enable row level security;

create policy "vehicles_select_own_company"
  on public.vehicles for select
  using (company_id = current_profile_company_id());

create policy "vehicles_admin_insert_own_company"
  on public.vehicles for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "vehicles_admin_update_own_company"
  on public.vehicles for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
