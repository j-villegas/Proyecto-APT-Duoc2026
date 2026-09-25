create table if not exists public.passenger_service_access (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  service_id uuid not null,
  passenger_id uuid not null,
  service_passenger_id uuid,
  access_code text not null,
  expires_at timestamptz,
  used_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint passenger_service_access_pkey primary key (id),
  constraint passenger_service_access_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint passenger_service_access_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade,
  constraint passenger_service_access_passenger_id_fkey foreign key (passenger_id) references public.passengers(id) on delete cascade,
  constraint passenger_service_access_service_passenger_id_fkey foreign key (service_passenger_id) references public.service_passengers(id) on delete cascade,
  constraint passenger_service_access_status_check check (status in ('active', 'expired', 'revoked')),
  constraint passenger_service_access_unique_code_per_company unique (company_id, access_code),
  constraint passenger_service_access_unique_per_service_passenger unique (service_id, passenger_id)
);

create index if not exists idx_passenger_service_access_company_id on public.passenger_service_access using btree (company_id);
create index if not exists idx_passenger_service_access_service_id on public.passenger_service_access using btree (service_id);
create index if not exists idx_passenger_service_access_passenger_id on public.passenger_service_access using btree (passenger_id);
create index if not exists idx_passenger_service_access_access_code on public.passenger_service_access using btree (access_code);

create trigger set_passenger_service_access_updated_at
  before update on public.passenger_service_access
  for each row
  execute function public.set_updated_at();

alter table public.passenger_service_access enable row level security;

create policy "passenger_service_access_select_own_company"
  on public.passenger_service_access for select
  using (company_id = current_profile_company_id());

create policy "passenger_service_access_admin_insert_own_company"
  on public.passenger_service_access for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "passenger_service_access_admin_update_own_company"
  on public.passenger_service_access for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
