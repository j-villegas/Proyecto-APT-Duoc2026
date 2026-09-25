-- Tabla puente contrato -> pasajero.
-- Permite que un contrato tenga un roster de pasajeros que se cargan
-- automáticamente al crear una ruta sobre ese contrato.
--
-- IMPORTANTE: revisar las políticas RLS antes de correr esto. Se asume el
-- mismo patrón de aislamiento por company_id que el resto de las tablas
-- (profiles.company_id). Si tu proyecto usa una función helper distinta
-- (p. ej. auth.company_id()), ajusta las políticas de abajo antes de ejecutar.

create table if not exists public.contract_passengers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contract_id uuid not null references public.contracts(id),
  passenger_id uuid not null references public.passengers(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (contract_id, passenger_id)
);

alter table public.contract_passengers enable row level security;

create policy "contract_passengers_select_own_company"
  on public.contract_passengers for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy "contract_passengers_insert_own_company"
  on public.contract_passengers for insert
  with check (company_id = (select company_id from public.profiles where id = auth.uid()));

create policy "contract_passengers_update_own_company"
  on public.contract_passengers for update
  using (company_id = (select company_id from public.profiles where id = auth.uid()));
