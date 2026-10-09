create table if not exists public.profiles (
  id uuid not null,
  company_id uuid not null,
  full_name text not null,
  email text not null,
  phone text,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade,
  constraint profiles_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint profiles_role_check check (role in ('admin', 'driver')),
  constraint profiles_status_check check (status in ('active', 'inactive', 'suspended'))
);

create index if not exists idx_profiles_company_id on public.profiles using btree (company_id);
create index if not exists idx_profiles_role on public.profiles using btree (role);
create index if not exists idx_profiles_status on public.profiles using btree (status) where (deleted_at is null);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own_company"
  on public.profiles for select
  using (company_id = current_profile_company_id());

create policy "profiles_admin_insert_own_company"
  on public.profiles for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "profiles_admin_update_own_company"
  on public.profiles for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
