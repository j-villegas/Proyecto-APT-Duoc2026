create table if not exists public.service_passengers (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  service_id uuid not null,
  service_stop_id uuid,
  passenger_id uuid not null,
  route_passenger_id uuid,
  seat_code text,
  attendance_status text not null default 'pending',
  boarded_at timestamptz,
  marked_by_driver_id uuid,
  marked_by_profile_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_passengers_pkey primary key (id),
  constraint service_passengers_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint service_passengers_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade,
  constraint service_passengers_service_stop_id_fkey foreign key (service_stop_id) references public.service_stops(id) on delete set null,
  constraint service_passengers_passenger_id_fkey foreign key (passenger_id) references public.passengers(id) on delete restrict,
  constraint service_passengers_route_passenger_id_fkey foreign key (route_passenger_id) references public.route_passengers(id) on delete set null,
  constraint service_passengers_marked_by_driver_id_fkey foreign key (marked_by_driver_id) references public.drivers(id) on delete set null,
  constraint service_passengers_marked_by_profile_id_fkey foreign key (marked_by_profile_id) references public.profiles(id) on delete set null,
  constraint service_passengers_attendance_status_check check (attendance_status in ('pending', 'boarded', 'no_show', 'cancelled', 'not_required')),
  constraint service_passengers_unique_passenger_per_service unique (service_id, passenger_id)
);

create index if not exists idx_service_passengers_company_id on public.service_passengers using btree (company_id);
create index if not exists idx_service_passengers_service_id on public.service_passengers using btree (service_id);
create index if not exists idx_service_passengers_passenger_id on public.service_passengers using btree (passenger_id);
create index if not exists idx_service_passengers_service_stop_id on public.service_passengers using btree (service_stop_id);
create index if not exists idx_service_passengers_attendance on public.service_passengers using btree (attendance_status);

create trigger set_service_passengers_updated_at
  before update on public.service_passengers
  for each row
  execute function public.set_updated_at();

alter table public.service_passengers enable row level security;

create policy "service_passengers_select_own_company"
  on public.service_passengers for select
  using (company_id = current_profile_company_id());

create policy "service_passengers_admin_insert_own_company"
  on public.service_passengers for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "service_passengers_admin_update_own_company"
  on public.service_passengers for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
