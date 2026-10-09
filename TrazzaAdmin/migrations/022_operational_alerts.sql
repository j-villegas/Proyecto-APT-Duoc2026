create table if not exists public.operational_alerts (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  alert_type text not null,
  severity text not null default 'medium',
  title text not null,
  description text,
  entity_type text,
  entity_id uuid,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at timestamptz,
  constraint operational_alerts_pkey primary key (id),
  constraint operational_alerts_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint operational_alerts_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  constraint operational_alerts_status_check check (status in ('open', 'acknowledged', 'resolved', 'dismissed'))
);

create index if not exists idx_operational_alerts_company_id on public.operational_alerts using btree (company_id);
create index if not exists idx_operational_alerts_status on public.operational_alerts using btree (status) where (deleted_at is null);
create index if not exists idx_operational_alerts_severity on public.operational_alerts using btree (severity) where (deleted_at is null);
create index if not exists idx_operational_alerts_entity on public.operational_alerts using btree (entity_type, entity_id);

create trigger set_operational_alerts_updated_at
  before update on public.operational_alerts
  for each row
  execute function public.set_updated_at();

alter table public.operational_alerts enable row level security;

create policy "operational_alerts_select_own_company"
  on public.operational_alerts for select
  using (company_id = current_profile_company_id());

create policy "operational_alerts_admin_insert_own_company"
  on public.operational_alerts for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "operational_alerts_admin_update_own_company"
  on public.operational_alerts for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
