create table if not exists public.route_stops (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  route_id uuid not null,
  stop_order int4 not null,
  stop_type text not null default 'pickup',
  name text not null,
  address text,
  latitude numeric,
  longitude numeric,
  planned_time time,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint route_stops_pkey primary key (id),
  constraint route_stops_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint route_stops_route_id_fkey foreign key (route_id) references public.routes(id) on delete cascade,
  constraint route_stops_order_check check (stop_order > 0),
  constraint route_stops_type_check check (stop_type in ('origin', 'pickup', 'destination')),
  constraint route_stops_unique_order_per_route unique (route_id, stop_order)
);

create index if not exists idx_route_stops_company_id on public.route_stops using btree (company_id);
create index if not exists idx_route_stops_route_id on public.route_stops using btree (route_id);

create trigger set_route_stops_updated_at
  before update on public.route_stops
  for each row
  execute function public.set_updated_at();

alter table public.route_stops enable row level security;

create policy "route_stops_select_own_company"
  on public.route_stops for select
  using (company_id = current_profile_company_id());

create policy "route_stops_admin_insert_own_company"
  on public.route_stops for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "route_stops_admin_update_own_company"
  on public.route_stops for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
