create table if not exists public.drivers (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  profile_id uuid,
  driver_code text,
  full_name text not null,
  rut text not null,
  phone text,
  email text,
  license_type text,
  license_number text,
  license_expires_at date,
  status text not null default 'available',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint drivers_pkey primary key (id),
  constraint drivers_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint drivers_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete set null,
  constraint drivers_status_check check (status in ('available', 'in_service', 'rest', 'inactive', 'suspended')),
  constraint drivers_unique_rut_per_company unique (company_id, rut),
  constraint drivers_unique_code_per_company unique (company_id, driver_code)
);

create index if not exists idx_drivers_company_id on public.drivers using btree (company_id);
create index if not exists idx_drivers_status on public.drivers using btree (status) where (deleted_at is null);
create index if not exists idx_drivers_profile_id on public.drivers using btree (profile_id);

create trigger set_drivers_updated_at
  before update on public.drivers
  for each row
  execute function public.set_updated_at();

alter table public.drivers enable row level security;

create policy "drivers_select_own_company"
  on public.drivers for select
  using (company_id = current_profile_company_id());

create policy "drivers_admin_insert_own_company"
  on public.drivers for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "drivers_admin_update_own_company"
  on public.drivers for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
