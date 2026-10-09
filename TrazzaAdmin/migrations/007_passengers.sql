create table if not exists public.passengers (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  full_name text not null,
  rut text not null,
  phone text,
  email text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint passengers_pkey primary key (id),
  constraint passengers_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint passengers_status_check check (status in ('active', 'inactive')),
  constraint passengers_unique_rut_per_company unique (company_id, rut)
);

create index if not exists idx_passengers_company_id on public.passengers using btree (company_id);
create index if not exists idx_passengers_status on public.passengers using btree (status) where (deleted_at is null);

create trigger set_passengers_updated_at
  before update on public.passengers
  for each row
  execute function public.set_updated_at();

alter table public.passengers enable row level security;

create policy "passengers_select_own_company"
  on public.passengers for select
  using (company_id = current_profile_company_id());

create policy "passengers_admin_insert_own_company"
  on public.passengers for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "passengers_admin_update_own_company"
  on public.passengers for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
