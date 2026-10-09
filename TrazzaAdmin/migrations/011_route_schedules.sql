create table if not exists public.route_schedules (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  route_id uuid not null,
  name text not null,
  days_of_week integer[] not null default '{}'::integer[],
  start_time time not null,
  end_time time,
  valid_from date,
  valid_until date,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint route_schedules_pkey primary key (id),
  constraint route_schedules_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint route_schedules_route_id_fkey foreign key (route_id) references public.routes(id) on delete cascade,
  constraint route_schedules_days_check check (array_length(days_of_week, 1) is null or days_of_week <@ array[1, 2, 3, 4, 5, 6, 7]),
  constraint route_schedules_status_check check (status in ('active', 'inactive')),
  constraint route_schedules_valid_dates_check check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index if not exists idx_route_schedules_company_id on public.route_schedules using btree (company_id);
create index if not exists idx_route_schedules_route_id on public.route_schedules using btree (route_id);

create trigger set_route_schedules_updated_at
  before update on public.route_schedules
  for each row
  execute function public.set_updated_at();

alter table public.route_schedules enable row level security;

create policy "route_schedules_select_own_company"
  on public.route_schedules for select
  using (company_id = current_profile_company_id());

create policy "route_schedules_admin_insert_own_company"
  on public.route_schedules for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "route_schedules_admin_update_own_company"
  on public.route_schedules for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
