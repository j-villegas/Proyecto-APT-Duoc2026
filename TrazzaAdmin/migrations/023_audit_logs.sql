-- Bitacora de auditoria. Append-only: sin policy de update.
create table if not exists public.audit_logs (
  id uuid not null default gen_random_uuid(),
  company_id uuid,
  actor_type text not null,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_pkey primary key (id),
  constraint audit_logs_company_id_fkey foreign key (company_id) references public.companies(id) on delete set null,
  constraint audit_logs_actor_type_check check (actor_type in ('admin', 'driver', 'passenger', 'system'))
);

create index if not exists idx_audit_logs_company_id on public.audit_logs using btree (company_id);
create index if not exists idx_audit_logs_entity on public.audit_logs using btree (entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs using btree (created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select_own_company"
  on public.audit_logs for select
  using (company_id = current_profile_company_id());

create policy "audit_logs_insert_own_company"
  on public.audit_logs for insert
  with check (company_id = current_profile_company_id());
