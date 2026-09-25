create table if not exists public.companies (
  id uuid not null default gen_random_uuid(),
  name text not null,
  rut text,
  business_name text,
  contact_email text,
  contact_phone text,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint companies_pkey primary key (id),
  constraint companies_status_check check (status in ('active', 'inactive'))
);

create trigger set_companies_updated_at
  before update on public.companies
  for each row
  execute function public.set_updated_at();

alter table public.companies enable row level security;

create policy "companies_select_own"
  on public.companies for select
  using (id = current_profile_company_id());

create policy "companies_admin_update_own"
  on public.companies for update
  using (id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (id = current_profile_company_id() and current_profile_role() = 'admin');
