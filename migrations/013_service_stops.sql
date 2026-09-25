create table if not exists public.service_stops (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  service_id uuid not null,
  route_stop_id uuid,
  stop_order int4 not null,
  stop_type text not null default 'pickup',
  name text not null,
  address text,
  latitude numeric,
  longitude numeric,
  planned_arrival_time time,
  actual_arrival_at timestamptz,
  completed_at timestamptz,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_stops_pkey primary key (id),
  constraint service_stops_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint service_stops_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade,
  constraint service_stops_route_stop_id_fkey foreign key (route_stop_id) references public.route_stops(id) on delete set null,
  constraint service_stops_order_check check (stop_order > 0),
  constraint service_stops_status_check check (status in ('pending', 'next', 'arrived', 'completed', 'skipped')),
  constraint service_stops_type_check check (stop_type in ('origin', 'pickup', 'destination')),
  constraint service_stops_unique_order_per_service unique (service_id, stop_order)
);

create index if not exists idx_service_stops_company_id on public.service_stops using btree (company_id);
create index if not exists idx_service_stops_service_id on public.service_stops using btree (service_id);
create index if not exists idx_service_stops_status on public.service_stops using btree (status);

create trigger set_service_stops_updated_at
  before update on public.service_stops
  for each row
  execute function public.set_updated_at();

alter table public.service_stops enable row level security;

create policy "service_stops_select_own_company"
  on public.service_stops for select
  using (company_id = current_profile_company_id());

create policy "service_stops_admin_insert_own_company"
  on public.service_stops for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "service_stops_admin_update_own_company"
  on public.service_stops for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
