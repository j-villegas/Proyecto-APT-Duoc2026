create table if not exists public.route_passengers (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  route_id uuid not null,
  route_stop_id uuid,
  passenger_id uuid not null,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint route_passengers_pkey primary key (id),
  constraint route_passengers_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint route_passengers_route_id_fkey foreign key (route_id) references public.routes(id) on delete cascade,
  constraint route_passengers_route_stop_id_fkey foreign key (route_stop_id) references public.route_stops(id) on delete set null,
  constraint route_passengers_passenger_id_fkey foreign key (passenger_id) references public.passengers(id) on delete restrict,
  constraint route_passengers_status_check check (status in ('active', 'inactive')),
  constraint route_passengers_unique_passenger_per_route unique (route_id, passenger_id)
);

create index if not exists idx_route_passengers_company_id on public.route_passengers using btree (company_id);
create index if not exists idx_route_passengers_route_id on public.route_passengers using btree (route_id);
create index if not exists idx_route_passengers_passenger_id on public.route_passengers using btree (passenger_id);

create trigger set_route_passengers_updated_at
  before update on public.route_passengers
  for each row
  execute function public.set_updated_at();

alter table public.route_passengers enable row level security;

create policy "route_passengers_select_own_company"
  on public.route_passengers for select
  using (company_id = current_profile_company_id());

create policy "route_passengers_admin_insert_own_company"
  on public.route_passengers for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "route_passengers_admin_update_own_company"
  on public.route_passengers for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
