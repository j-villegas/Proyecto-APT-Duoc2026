create table if not exists public.services (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  contract_id uuid,
  route_id uuid,
  service_code text not null,
  scheduled_date date not null,
  scheduled_start_time time,
  scheduled_end_time time,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  driver_id uuid,
  vehicle_id uuid,
  status text not null default 'scheduled',
  completion_source text,
  finalized_by_profile_id uuid,
  cancel_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint services_pkey primary key (id),
  constraint services_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint services_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete set null,
  constraint services_route_id_fkey foreign key (route_id) references public.routes(id) on delete set null,
  constraint services_driver_id_fkey foreign key (driver_id) references public.drivers(id) on delete set null,
  constraint services_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete set null,
  constraint services_finalized_by_profile_id_fkey foreign key (finalized_by_profile_id) references public.profiles(id) on delete set null,
  constraint services_actual_time_check check (actual_end_at is null or actual_start_at is null or actual_end_at >= actual_start_at),
  constraint services_completion_source_check check (completion_source is null or completion_source in ('driver', 'admin')),
  constraint services_status_check check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  constraint services_unique_code_per_company unique (company_id, service_code)
);

create index if not exists idx_services_company_id on public.services using btree (company_id);
create index if not exists idx_services_route_id on public.services using btree (route_id);
create index if not exists idx_services_contract_id on public.services using btree (contract_id);
create index if not exists idx_services_driver_id on public.services using btree (driver_id);
create index if not exists idx_services_vehicle_id on public.services using btree (vehicle_id);
create index if not exists idx_services_status on public.services using btree (status) where (deleted_at is null);
create index if not exists idx_services_scheduled_date on public.services using btree (scheduled_date);
create index if not exists idx_services_company_date_status on public.services using btree (company_id, scheduled_date, status) where (deleted_at is null);

create trigger set_services_updated_at
  before update on public.services
  for each row
  execute function public.set_updated_at();

alter table public.services enable row level security;

create policy "services_select_own_company"
  on public.services for select
  using (company_id = current_profile_company_id());

create policy "services_admin_insert_own_company"
  on public.services for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "services_admin_update_own_company"
  on public.services for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
