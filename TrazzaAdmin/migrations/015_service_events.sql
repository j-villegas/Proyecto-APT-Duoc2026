-- Bitacora de eventos de un servicio. Append-only: sin policy de update.
create table if not exists public.service_events (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  service_id uuid not null,
  actor_type text not null,
  actor_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint service_events_pkey primary key (id),
  constraint service_events_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint service_events_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade,
  constraint service_events_actor_type_check check (actor_type in ('admin', 'driver', 'passenger', 'system')),
  constraint service_events_event_type_check check (event_type in (
    'service_started', 'service_finished', 'service_cancelled', 'stop_arrived', 'stop_completed',
    'stop_skipped', 'passenger_boarded', 'passenger_no_show', 'incident_reported', 'vehicle_changed',
    'driver_changed', 'location_shared', 'note_added'
  ))
);

create index if not exists idx_service_events_company_id on public.service_events using btree (company_id);
create index if not exists idx_service_events_service_id on public.service_events using btree (service_id);
create index if not exists idx_service_events_event_type on public.service_events using btree (event_type);
create index if not exists idx_service_events_created_at on public.service_events using btree (created_at desc);

alter table public.service_events enable row level security;

create policy "service_events_select_own_company"
  on public.service_events for select
  using (company_id = current_profile_company_id());

-- Nota: pese al nombre, esta policy no exige rol admin (permite insertar a
-- cualquier usuario autenticado de la misma empresa, incluye conductores).
create policy "service_events_admin_insert_own_company"
  on public.service_events for insert
  with check (company_id = current_profile_company_id());
