create table if not exists public.incident_types (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  category text not null,
  source_allowed text[] not null default array['admin', 'driver', 'passenger']::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incident_types_pkey primary key (id),
  constraint incident_types_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint incident_types_category_check check (category in ('route', 'vehicle', 'passenger', 'driver', 'safety', 'operational')),
  constraint incident_types_sources_check check (source_allowed <@ array['admin', 'driver', 'passenger', 'system']),
  constraint incident_types_unique_name_per_company unique (company_id, name)
);

create index if not exists idx_incident_types_company_id on public.incident_types using btree (company_id);

create trigger set_incident_types_updated_at
  before update on public.incident_types
  for each row
  execute function public.set_updated_at();

alter table public.incident_types enable row level security;

create policy "incident_types_select_own_company"
  on public.incident_types for select
  using (company_id = current_profile_company_id());

create policy "incident_types_admin_insert_own_company"
  on public.incident_types for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "incident_types_admin_update_own_company"
  on public.incident_types for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
