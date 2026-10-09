create table if not exists public.contracts (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  client_name text not null,
  contract_name text,
  start_date date,
  end_date date,
  status text not null default 'active',
  priority text not null default 'normal',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contracts_pkey primary key (id),
  constraint contracts_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint contracts_priority_check check (priority in ('normal', 'high')),
  constraint contracts_status_check check (status in ('active', 'review', 'expired', 'cancelled'))
);

create index if not exists idx_contracts_company_id on public.contracts using btree (company_id);
create index if not exists idx_contracts_status on public.contracts using btree (status) where (deleted_at is null);

create trigger set_contracts_updated_at
  before update on public.contracts
  for each row
  execute function public.set_updated_at();

alter table public.contracts enable row level security;

create policy "contracts_select_own_company"
  on public.contracts for select
  using (company_id = current_profile_company_id());

create policy "contracts_admin_insert_own_company"
  on public.contracts for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

create policy "contracts_admin_update_own_company"
  on public.contracts for update
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin')
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');
