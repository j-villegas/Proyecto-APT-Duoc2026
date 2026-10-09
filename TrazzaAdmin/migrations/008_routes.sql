create table if not exists public.routes (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  contract_id uuid,
  route_code text not null,
  name text not null,
  origin_name text,
  origin_address text,
  origin_latitude numeric,
  origin_longitude numeric,
  destination_name text,
  destination_address text,
  destination_latitude numeric,
  destination_longitude numeric,
  estimated_duration_minutes int4,
  estimated_distance_km numeric,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint routes_pkey primary key (id),
  constraint routes_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint routes_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete set null,
  constraint routes_distance_check check (estimated_distance_km is null or estimated_distance_km >= 0),
  constraint routes_duration_check check (estimated_duration_minutes is null or estimated_duration_minutes >= 0),
  constraint routes_status_check check (status in ('active', 'inactive')),
  constraint routes_unique_code_per_company unique (company_id, route_code)
);

create index if not exists idx_routes_company_id on public.routes using btree (company_id);
create index if not exists idx_routes_contract_id on public.routes using btree (contract_id);
create index if not exists idx_routes_status on public.routes using btree (status) where (deleted_at is null);

create trigger set_routes_updated_at
  before update on public.routes
  for each row
  execute function public.set_updated_at();

alter table public.routes enable row level security;

create policy "routes_select_own_company"
  on public.routes for select
  using (company_id = current_profile_company_id());

create policy "routes_admin_insert_own_company"
  on public.routes for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "routes_admin_update_own_company"
  on public.routes for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
