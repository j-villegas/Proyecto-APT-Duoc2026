create table if not exists public.fuel_logs (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  vehicle_id uuid not null,
  service_id uuid,
  driver_id uuid,
  fuel_datetime timestamptz not null default now(),
  station_name text,
  fuel_type text,
  liters numeric not null,
  total_amount numeric not null,
  unit_price numeric,
  odometer_km numeric,
  fuel_level_before_eighths int4,
  fuel_level_after_eighths int4,
  receipt_number text,
  receipt_file_url text,
  notes text,
  created_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint fuel_logs_pkey primary key (id),
  constraint fuel_logs_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint fuel_logs_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete restrict,
  constraint fuel_logs_service_id_fkey foreign key (service_id) references public.services(id) on delete set null,
  constraint fuel_logs_driver_id_fkey foreign key (driver_id) references public.drivers(id) on delete set null,
  constraint fuel_logs_created_by_profile_id_fkey foreign key (created_by_profile_id) references public.profiles(id) on delete set null,
  constraint fuel_logs_fuel_type_check check (fuel_type is null or fuel_type in ('diesel', 'gasoline_93', 'gasoline_95', 'gasoline_97', 'electric', 'hybrid', 'other')),
  constraint fuel_logs_level_after_check check (fuel_level_after_eighths is null or (fuel_level_after_eighths >= 1 and fuel_level_after_eighths <= 8)),
  constraint fuel_logs_level_before_check check (fuel_level_before_eighths is null or (fuel_level_before_eighths >= 1 and fuel_level_before_eighths <= 8)),
  constraint fuel_logs_level_order_check check (fuel_level_before_eighths is null or fuel_level_after_eighths is null or fuel_level_after_eighths >= fuel_level_before_eighths),
  constraint fuel_logs_liters_check check (liters > 0),
  constraint fuel_logs_total_amount_check check (total_amount >= 0),
  constraint fuel_logs_unit_price_check check (unit_price is null or unit_price >= 0)
);

create index if not exists idx_fuel_logs_company_id on public.fuel_logs using btree (company_id);
create index if not exists idx_fuel_logs_vehicle_id on public.fuel_logs using btree (vehicle_id);
create index if not exists idx_fuel_logs_service_id on public.fuel_logs using btree (service_id);
create index if not exists idx_fuel_logs_fuel_datetime on public.fuel_logs using btree (fuel_datetime desc);

create trigger set_fuel_logs_updated_at
  before update on public.fuel_logs
  for each row
  execute function public.set_updated_at();

alter table public.fuel_logs enable row level security;

create policy "fuel_logs_select_own_company"
  on public.fuel_logs for select
  using (company_id = current_profile_company_id());

create policy "fuel_logs_admin_insert_own_company"
  on public.fuel_logs for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "fuel_logs_admin_update_own_company"
  on public.fuel_logs for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
