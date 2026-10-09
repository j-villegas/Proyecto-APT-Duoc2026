create table if not exists public.maintenance_orders (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  vehicle_id uuid not null,
  incident_id uuid,
  order_code text,
  maintenance_type text not null default 'corrective',
  priority text not null default 'medium',
  status text not null default 'scheduled',
  title text not null,
  description text,
  workshop_name text,
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  estimated_cost numeric,
  final_cost numeric,
  odometer_km numeric,
  checklist jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint maintenance_orders_pkey primary key (id),
  constraint maintenance_orders_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint maintenance_orders_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete restrict,
  constraint maintenance_orders_incident_id_fkey foreign key (incident_id) references public.incidents(id) on delete set null,
  constraint maintenance_orders_created_by_profile_id_fkey foreign key (created_by_profile_id) references public.profiles(id) on delete set null,
  constraint maintenance_orders_cost_check check ((estimated_cost is null or estimated_cost >= 0) and (final_cost is null or final_cost >= 0)),
  constraint maintenance_orders_priority_check check (priority in ('low', 'medium', 'high', 'critical')),
  constraint maintenance_orders_status_check check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  constraint maintenance_orders_type_check check (maintenance_type in ('preventive', 'corrective')),
  constraint maintenance_orders_unique_code_per_company unique (company_id, order_code)
);

create index if not exists idx_maintenance_orders_company_id on public.maintenance_orders using btree (company_id);
create index if not exists idx_maintenance_orders_vehicle_id on public.maintenance_orders using btree (vehicle_id);
create index if not exists idx_maintenance_orders_incident_id on public.maintenance_orders using btree (incident_id);
create index if not exists idx_maintenance_orders_status on public.maintenance_orders using btree (status) where (deleted_at is null);

create trigger set_maintenance_orders_updated_at
  before update on public.maintenance_orders
  for each row
  execute function public.set_updated_at();

alter table public.maintenance_orders enable row level security;

create policy "maintenance_orders_select_own_company"
  on public.maintenance_orders for select
  using (company_id = current_profile_company_id());

create policy "maintenance_orders_admin_insert_own_company"
  on public.maintenance_orders for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "maintenance_orders_admin_update_own_company"
  on public.maintenance_orders for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
