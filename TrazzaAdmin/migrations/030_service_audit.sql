-- Auditoría de servicios realizados + flujo bajo demanda (bolsa de viajes).
--
-- Hasta 029 un servicio solo nacía en el panel (admin_create_route_service)
-- ya asignado a un conductor y un vehículo. Esta migración agrega:
--
-- 1. Bolsa de viajes: el pasajero solicita un viaje desde la app
--    (mobile_request_service) o el admin publica un servicio programado sin
--    asignar (admin_publish_service). Queda con dispatch_mode = 'pool' y sin
--    conductor hasta que uno lo toma con su vehículo (mobile_accept_service).
--    La toma bloquea la fila (for update) y exige driver_id null: dos
--    conductores no pueden quedarse con el mismo servicio.
-- 2. Estimaciones: services guarda distancia/duración estimadas al momento de
--    la solicitud (o las toma de la ruta), y origen/destino propios para los
--    servicios que no tienen ruta del catálogo.
-- 3. Métricas reales vs. estimadas (service_metrics): se consolidan solas al
--    cerrar el servicio (trigger), desde los pings GPS, paradas, pasajeros e
--    incidentes, y marcan anomalías (inicio tardío, desvío de distancia, GPS
--    con huecos o simulado, paradas saltadas...).
-- 4. Auditoría del admin: admin_audit_service aprueba o deja observado un
--    servicio cerrado, con comentario, quién y cuándo. El historial de
--    decisiones (service_audits) y la bitácora (service_events) son
--    inmutables: un trigger rechaza update/delete (salvo el borrado en cascada
--    del servicio, que el panel nunca hace: usa soft delete).
--
-- Patrón de aislamiento: igual que 025-029. Admin y conductores ven por
-- current_profile_company_id(); el pasajero solo sus servicios vía
-- is_passenger_of_service(). Las escrituras pasan por funciones security
-- definer que validan empresa y rol a mano.

-- 1. Columnas nuevas de services ---------------------------------------------

-- requested_by_passenger_id, accepted_by_driver_id y audited_by_profile_id van
-- SIN foreign key a propósito: una segunda FK services -> drivers/profiles/
-- passengers vuelve ambiguos los embeds de PostgREST que ya usan el panel y la
-- app (select=drivers(...)) y los rompe. Solo las escriben funciones
-- security definer de esta migración, que validan los ids.

alter table public.services
  add column if not exists dispatch_mode text not null default 'assigned',
  add column if not exists request_source text not null default 'admin',
  add column if not exists requested_by_passenger_id uuid,
  add column if not exists requested_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_driver_id uuid,
  add column if not exists origin_name text,
  add column if not exists origin_address text,
  add column if not exists origin_latitude numeric,
  add column if not exists origin_longitude numeric,
  add column if not exists destination_name text,
  add column if not exists destination_address text,
  add column if not exists destination_latitude numeric,
  add column if not exists destination_longitude numeric,
  add column if not exists estimated_distance_km numeric,
  add column if not exists estimated_duration_minutes int4,
  add column if not exists audit_status text not null default 'pending',
  add column if not exists audited_at timestamptz,
  add column if not exists audited_by_profile_id uuid,
  add column if not exists audit_notes text;

alter table public.services drop constraint if exists services_dispatch_mode_check;
alter table public.services
  add constraint services_dispatch_mode_check check (dispatch_mode in ('assigned', 'pool'));
alter table public.services drop constraint if exists services_request_source_check;
alter table public.services
  add constraint services_request_source_check check (request_source in ('admin', 'passenger'));
alter table public.services drop constraint if exists services_audit_status_check;
alter table public.services
  add constraint services_audit_status_check check (audit_status in ('pending', 'approved', 'observed'));
alter table public.services drop constraint if exists services_estimates_check;
alter table public.services
  add constraint services_estimates_check check (
    (estimated_distance_km is null or estimated_distance_km >= 0)
    and (estimated_duration_minutes is null or estimated_duration_minutes >= 0)
  );

-- La bolsa: servicios programados sin conductor.
create index if not exists idx_services_pool
  on public.services using btree (company_id, scheduled_date)
  where (dispatch_mode = 'pool' and driver_id is null and status = 'scheduled' and deleted_at is null);
create index if not exists idx_services_audit_status
  on public.services using btree (company_id, audit_status) where (deleted_at is null);

-- GPS simulado (modo demostración de la app): queda marcado para la auditoría.
alter table public.service_locations
  add column if not exists is_simulated boolean not null default false;

-- 2. Tipos de evento nuevos -----------------------------------------------------

alter table public.service_events drop constraint if exists service_events_event_type_check;
alter table public.service_events
  add constraint service_events_event_type_check check (event_type in (
    'service_started', 'service_finished', 'service_cancelled', 'stop_arrived', 'stop_completed',
    'stop_skipped', 'passenger_boarded', 'passenger_no_show', 'incident_reported', 'vehicle_changed',
    'driver_changed', 'location_shared', 'note_added', 'schedule_updated',
    'service_requested', 'service_published', 'service_accepted', 'request_cancelled',
    'metrics_consolidated', 'service_audited'
  ));

-- 3. Bitácoras inmutables ---------------------------------------------------------

-- Rechaza update/delete. El delete solo pasa si el servicio padre ya no existe
-- (borrado en cascada del servicio completo).
create or replace function public.prevent_audit_trail_mutation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.services where id = old.service_id) then
    return old;
  end if;
  raise exception 'El historial del servicio es inmutable: no se puede modificar ni eliminar.';
end;
$function$;

drop trigger if exists service_events_immutable on public.service_events;
create trigger service_events_immutable
  before update or delete on public.service_events
  for each row execute function public.prevent_audit_trail_mutation();

drop trigger if exists service_locations_immutable on public.service_locations;
create trigger service_locations_immutable
  before update or delete on public.service_locations
  for each row execute function public.prevent_audit_trail_mutation();

-- 4. Historial de auditorías -------------------------------------------------------

create table if not exists public.service_audits (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  service_id uuid not null,
  decision text not null,
  notes text,
  audited_by_profile_id uuid,
  metrics_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint service_audits_pkey primary key (id),
  constraint service_audits_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint service_audits_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade,
  constraint service_audits_audited_by_fkey foreign key (audited_by_profile_id) references public.profiles(id) on delete set null,
  constraint service_audits_decision_check check (decision in ('approved', 'observed'))
);

create index if not exists idx_service_audits_service_id on public.service_audits using btree (service_id, created_at desc);
create index if not exists idx_service_audits_company_id on public.service_audits using btree (company_id);

alter table public.service_audits enable row level security;

-- Solo lectura por RLS: se escribe únicamente con admin_audit_service.
create policy "service_audits_select_own_company"
  on public.service_audits for select
  using (company_id = current_profile_company_id());

drop trigger if exists service_audits_immutable on public.service_audits;
create trigger service_audits_immutable
  before update or delete on public.service_audits
  for each row execute function public.prevent_audit_trail_mutation();

-- 5. Métricas consolidadas ----------------------------------------------------------

create table if not exists public.service_metrics (
  service_id uuid not null,
  company_id uuid not null,
  scheduled_start_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  start_delay_minutes numeric,
  estimated_duration_minutes numeric,
  actual_duration_minutes numeric,
  estimated_distance_km numeric,
  actual_distance_km numeric,
  location_points int4 not null default 0,
  simulated_points int4 not null default 0,
  max_location_gap_minutes numeric,
  avg_speed_kmh numeric,
  max_speed_kmh numeric,
  stops_total int4 not null default 0,
  stops_completed int4 not null default 0,
  stops_skipped int4 not null default 0,
  stops_unconfirmed int4 not null default 0,
  passengers_total int4 not null default 0,
  passengers_boarded int4 not null default 0,
  passengers_no_show int4 not null default 0,
  incidents_count int4 not null default 0,
  events_count int4 not null default 0,
  anomalies text[] not null default '{}'::text[],
  trajectory jsonb not null default '[]'::jsonb,
  consolidated_at timestamptz not null default now(),
  constraint service_metrics_pkey primary key (service_id),
  constraint service_metrics_service_id_fkey foreign key (service_id) references public.services(id) on delete cascade,
  constraint service_metrics_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict
);

create index if not exists idx_service_metrics_company_id on public.service_metrics using btree (company_id);
create index if not exists idx_service_metrics_anomalies on public.service_metrics using gin (anomalies);

alter table public.service_metrics enable row level security;

create policy "service_metrics_select_own_company"
  on public.service_metrics for select
  using (company_id = current_profile_company_id());

-- 6. Helpers --------------------------------------------------------------------------

-- Distancia en línea recta (haversine), en km.
create or replace function public.geo_distance_km(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric
)
returns numeric
language sql
immutable
as $function$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else (2 * 6371 * asin(sqrt(
      power(sin(radians((p_lat2 - p_lat1)::float8) / 2), 2)
      + cos(radians(p_lat1::float8)) * cos(radians(p_lat2::float8))
        * power(sin(radians((p_lng2 - p_lng1)::float8) / 2), 2)
    )))::numeric
  end;
$function$;

-- Estimación inicial de un viaje punto a punto: la distancia por calle se
-- aproxima como 1,3 veces la recta y la duración a 30 km/h (mínimo 5 min).
-- Constantes compartidas con la app (TrazzaMobile/src/utils/estimates.ts).
create or replace function public.estimate_trip(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric,
  out distance_km numeric, out duration_minutes int4
)
language plpgsql
immutable
as $function$
declare
  v_straight numeric := public.geo_distance_km(p_lat1, p_lng1, p_lat2, p_lng2);
begin
  if v_straight is null then
    distance_km := null;
    duration_minutes := null;
    return;
  end if;
  distance_km := round(v_straight * 1.3, 2);
  duration_minutes := greatest(5, ceil(distance_km / 30 * 60))::int4;
end;
$function$;

-- 7. Solicitud del pasajero -------------------------------------------------------------

-- Entrada (jsonb):
-- {
--   "origin":      { "name": "...", "address": "...", "lat": -33.4, "lng": -70.6 },
--   "destination": { "name": "...", "address": "...", "lat": null, "lng": null },
--   "scheduled_at": "2026-11-19T18:30:00-03:00" | null (= ahora),
--   "notes": "..."
-- }
create or replace function public.mobile_request_service(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_passenger uuid := public.current_passenger_id();
  v_company uuid;
  v_origin jsonb := coalesce(p_input->'origin', '{}'::jsonb);
  v_dest jsonb := coalesce(p_input->'destination', '{}'::jsonb);
  v_origin_name text := nullif(trim(v_origin->>'name'), '');
  v_dest_name text := nullif(trim(v_dest->>'name'), '');
  v_o_lat numeric := nullif(v_origin->>'lat', '')::numeric;
  v_o_lng numeric := nullif(v_origin->>'lng', '')::numeric;
  v_d_lat numeric := nullif(v_dest->>'lat', '')::numeric;
  v_d_lng numeric := nullif(v_dest->>'lng', '')::numeric;
  v_at timestamptz := coalesce(nullif(p_input->>'scheduled_at', '')::timestamptz, now());
  v_local timestamp;
  v_estimate record;
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_service_id uuid;
  v_origin_stop uuid;
begin
  if v_passenger is null then
    raise exception 'Tu cuenta no está asociada a un pasajero.';
  end if;
  if v_origin_name is null or v_dest_name is null then
    raise exception 'Indica el punto de recogida y el destino del viaje.';
  end if;
  if v_at < now() - interval '5 minutes' then
    raise exception 'La hora del viaje no puede estar en el pasado.';
  end if;

  select company_id into v_company from public.passengers where id = v_passenger;

  -- Una solicitud abierta a la vez: evita duplicados por doble toque.
  if exists (
    select 1 from public.services
    where requested_by_passenger_id = v_passenger and deleted_at is null
      and dispatch_mode = 'pool' and driver_id is null and status = 'scheduled'
  ) then
    raise exception 'Ya tienes una solicitud esperando conductor. Cancélala antes de pedir otra.';
  end if;

  select * into v_estimate from public.estimate_trip(v_o_lat, v_o_lng, v_d_lat, v_d_lng);
  v_local := v_at at time zone 'America/Santiago';

  loop
    select 'OD-' || to_char(v_local, 'YYMMDD') || '-'
      || string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
    into v_code from generate_series(1, 4);
    exit when not exists (select 1 from public.services where company_id = v_company and service_code = v_code);
  end loop;

  insert into public.services (
    company_id, service_code, scheduled_date, scheduled_start_time, scheduled_end_time, status,
    dispatch_mode, request_source, requested_by_passenger_id, requested_at, published_at,
    origin_name, origin_address, origin_latitude, origin_longitude,
    destination_name, destination_address, destination_latitude, destination_longitude,
    estimated_distance_km, estimated_duration_minutes, notes
  ) values (
    v_company, v_code, v_local::date, v_local::time,
    case when v_estimate.duration_minutes is null then null
      else (v_local + make_interval(mins => v_estimate.duration_minutes))::time end,
    'scheduled', 'pool', 'passenger', v_passenger, now(), now(),
    v_origin_name, nullif(trim(v_origin->>'address'), ''), v_o_lat, v_o_lng,
    v_dest_name, nullif(trim(v_dest->>'address'), ''), v_d_lat, v_d_lng,
    v_estimate.distance_km, v_estimate.duration_minutes, nullif(trim(p_input->>'notes'), '')
  )
  returning id into v_service_id;

  insert into public.service_stops (company_id, service_id, stop_order, stop_type, name, address,
    latitude, longitude, planned_arrival_time, status)
  values (v_company, v_service_id, 1, 'origin', v_origin_name, nullif(trim(v_origin->>'address'), ''),
    v_o_lat, v_o_lng, v_local::time, 'pending')
  returning id into v_origin_stop;

  insert into public.service_stops (company_id, service_id, stop_order, stop_type, name, address,
    latitude, longitude, planned_arrival_time, status)
  values (v_company, v_service_id, 2, 'destination', v_dest_name, nullif(trim(v_dest->>'address'), ''),
    v_d_lat, v_d_lng,
    case when v_estimate.duration_minutes is null then null
      else (v_local + make_interval(mins => v_estimate.duration_minutes))::time end,
    'pending');

  insert into public.service_passengers (company_id, service_id, passenger_id, service_stop_id, attendance_status)
  values (v_company, v_service_id, v_passenger, v_origin_stop, 'pending');

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_company, v_service_id, 'passenger', v_passenger, 'service_requested',
    jsonb_build_object(
      'source', 'mobile',
      'origin', jsonb_build_object('name', v_origin_name, 'lat', v_o_lat, 'lng', v_o_lng),
      'destination', jsonb_build_object('name', v_dest_name, 'lat', v_d_lat, 'lng', v_d_lng),
      'scheduled_at', v_at,
      'estimated_distance_km', v_estimate.distance_km,
      'estimated_duration_minutes', v_estimate.duration_minutes
    ));

  return v_service_id;
end;
$function$;

-- El pasajero cancela su solicitud mientras ningún conductor la haya tomado.
create or replace function public.mobile_cancel_request(p_service_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_passenger uuid := public.current_passenger_id();
  v_service public.services;
begin
  select * into v_service from public.services
  where id = p_service_id and deleted_at is null
  for update;
  if v_passenger is null or not found or v_service.requested_by_passenger_id is distinct from v_passenger then
    raise exception 'Esta solicitud no es tuya.';
  end if;
  if v_service.status <> 'scheduled' or v_service.driver_id is not null then
    raise exception 'Un conductor ya tomó este viaje: pide la cancelación a la central.';
  end if;

  update public.services
  set status = 'cancelled',
      cancel_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelado por el pasajero')
  where id = p_service_id;

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'passenger', v_passenger, 'request_cancelled',
    jsonb_build_object('source', 'mobile', 'reason', nullif(trim(p_reason), '')));
end;
$function$;

-- 8. Publicar en la bolsa (panel) ----------------------------------------------------------

-- Un servicio programado queda disponible para que lo tome cualquier
-- conductor de la empresa. Si tenía conductor/vehículo asignados, se liberan.
create or replace function public.admin_publish_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services := public.lock_service_for_admin(p_service_id);
  v_route public.routes;
begin
  if v_service.status <> 'scheduled' then
    raise exception 'Solo se pueden publicar servicios programados.';
  end if;
  if v_service.dispatch_mode = 'pool' and v_service.driver_id is null then
    raise exception 'Este servicio ya está en la bolsa de viajes.';
  end if;

  -- Estimación de la ruta del catálogo, si el servicio no trae una propia.
  select * into v_route from public.routes r where r.id = v_service.route_id;

  update public.services
  set dispatch_mode = 'pool',
      driver_id = null,
      vehicle_id = null,
      accepted_at = null,
      accepted_by_driver_id = null,
      published_at = now(),
      estimated_distance_km = coalesce(estimated_distance_km, v_route.estimated_distance_km),
      estimated_duration_minutes = coalesce(estimated_duration_minutes, v_route.estimated_duration_minutes)
  where id = p_service_id;

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'admin', auth.uid(), 'service_published',
    jsonb_build_object('source', 'panel',
      'previous_driver_id', v_service.driver_id, 'previous_vehicle_id', v_service.vehicle_id));
end;
$function$;

-- 9. Toma del servicio (conductor) ------------------------------------------------------------

create or replace function public.mobile_accept_service(p_service_id uuid, p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_driver uuid := public.current_driver_id();
  v_driver_row public.drivers;
  v_service public.services;
  v_vehicle public.vehicles;
begin
  if v_driver is null then
    raise exception 'Tu cuenta no está asociada a un conductor.';
  end if;
  select * into v_driver_row from public.drivers where id = v_driver;
  if v_driver_row.status in ('inactive', 'suspended') then
    raise exception 'Tu cuenta de conductor no está habilitada para tomar viajes.';
  end if;

  -- Bloqueo de la fila: si dos conductores aceptan a la vez, el segundo
  -- espera y luego ve driver_id ya asignado.
  select * into v_service from public.services
  where id = p_service_id and deleted_at is null and company_id = v_driver_row.company_id
  for update;
  if not found then
    raise exception 'Este viaje ya no está disponible.';
  end if;
  if v_service.driver_id = v_driver then
    return; -- doble toque del mismo conductor
  end if;
  if v_service.driver_id is not null or v_service.dispatch_mode <> 'pool' then
    raise exception 'Otro conductor ya tomó este viaje.';
  end if;
  if v_service.status <> 'scheduled' then
    raise exception 'Este viaje ya no está disponible.';
  end if;

  select * into v_vehicle from public.vehicles
  where id = p_vehicle_id and company_id = v_service.company_id and deleted_at is null;
  if not found then
    raise exception 'El vehículo seleccionado no existe.';
  end if;
  if v_vehicle.status in ('maintenance', 'out_of_service') then
    raise exception 'El vehículo % no está operativo.', v_vehicle.plate;
  end if;
  if exists (
    select 1 from public.services
    where vehicle_id = p_vehicle_id and status = 'in_progress' and deleted_at is null
      and (driver_id is distinct from v_driver)
  ) then
    raise exception 'El vehículo % está en un servicio en curso de otro conductor.', v_vehicle.plate;
  end if;

  update public.services
  set driver_id = v_driver,
      vehicle_id = p_vehicle_id,
      accepted_at = now(),
      accepted_by_driver_id = v_driver
  where id = p_service_id;

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'driver', v_driver, 'service_accepted',
    jsonb_build_object('source', 'mobile', 'vehicle_id', p_vehicle_id, 'plate', v_vehicle.plate,
      'wait_minutes', round(extract(epoch from (now() - coalesce(v_service.published_at, v_service.requested_at, v_service.created_at))) / 60, 1)));
end;
$function$;

-- 10. Ubicación (con marca de simulación) ---------------------------------------------------------

drop function if exists public.mobile_report_location(uuid, numeric, numeric, numeric, numeric, numeric);

create or replace function public.mobile_report_location(
  p_service_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_speed_kmh numeric default null,
  p_heading numeric default null,
  p_accuracy_meters numeric default null,
  p_is_simulated boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_driver uuid := public.current_driver_id();
  v_service public.services;
begin
  select * into v_service from public.services where id = p_service_id and deleted_at is null;
  if v_driver is null or not found or v_service.driver_id is distinct from v_driver then
    raise exception 'El servicio no está asignado a este conductor.';
  end if;
  if v_service.status <> 'in_progress' then
    raise exception 'El servicio ya no está en curso.';
  end if;

  insert into public.service_locations
    (company_id, service_id, driver_id, vehicle_id, latitude, longitude, speed_kmh, heading,
     accuracy_meters, is_simulated)
  values
    (v_service.company_id, p_service_id, v_driver, v_service.vehicle_id,
     p_latitude, p_longitude, p_speed_kmh, p_heading, p_accuracy_meters, coalesce(p_is_simulated, false));
end;
$function$;

-- 11. Consolidación de métricas -----------------------------------------------------------------------

create or replace function public.consolidate_service_metrics(p_service_id uuid)
returns public.service_metrics
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services;
  v_route public.routes;
  v_metrics public.service_metrics;
  v_scheduled_at timestamptz;
  v_est_duration numeric;
  v_est_distance numeric;
  v_actual_duration numeric;
  v_delay numeric;
  v_points int4;
  v_simulated int4;
  v_distance numeric;
  v_max_gap numeric;
  v_max_speed numeric;
  v_trajectory jsonb;
  v_stops record;
  v_pax record;
  v_incidents int4;
  v_events int4;
  v_anomalies text[] := '{}'::text[];
begin
  select * into v_service from public.services where id = p_service_id;
  if not found then
    raise exception 'El servicio no existe.';
  end if;
  select * into v_route from public.routes where id = v_service.route_id;

  v_scheduled_at := public.mobile_scheduled_at(v_service);

  -- Estimado: el del servicio; si no, el de la ruta; si no, la programación.
  v_est_duration := coalesce(
    v_service.estimated_duration_minutes,
    v_route.estimated_duration_minutes,
    case when v_service.scheduled_end_time is not null and v_service.scheduled_start_time is not null then
      extract(epoch from (public.mobile_eta(v_service) - v_scheduled_at)) / 60 end
  );
  v_est_distance := coalesce(v_service.estimated_distance_km, v_route.estimated_distance_km);
  if v_est_distance is null then
    -- Suma de tramos rectos entre paradas con coordenadas, con factor de calle.
    select round(sum(d) * 1.3, 2) into v_est_distance from (
      select public.geo_distance_km(latitude, longitude,
        lead(latitude) over (order by stop_order), lead(longitude) over (order by stop_order)) as d
      from public.service_stops
      where service_id = p_service_id and latitude is not null and longitude is not null
    ) t;
  end if;

  if v_service.actual_start_at is not null and v_service.actual_end_at is not null then
    v_actual_duration := round(extract(epoch from (v_service.actual_end_at - v_service.actual_start_at)) / 60, 1);
  end if;
  if v_service.actual_start_at is not null and v_scheduled_at is not null then
    v_delay := round(extract(epoch from (v_service.actual_start_at - v_scheduled_at)) / 60, 1);
  end if;

  -- Trayectoria GPS real.
  with pts as (
    select latitude, longitude, speed_kmh, is_simulated, recorded_at,
      lag(latitude) over w as prev_lat, lag(longitude) over w as prev_lng,
      lag(recorded_at) over w as prev_at
    from public.service_locations
    where service_id = p_service_id
    window w as (order by recorded_at, created_at)
  )
  select count(*)::int4,
    count(*) filter (where is_simulated)::int4,
    round(coalesce(sum(public.geo_distance_km(prev_lat, prev_lng, latitude, longitude)), 0), 2),
    round(max(extract(epoch from (recorded_at - prev_at)) / 60), 1),
    round(max(speed_kmh), 1)
  into v_points, v_simulated, v_distance, v_max_gap, v_max_speed
  from pts;

  select coalesce(jsonb_agg(jsonb_build_object('lat', latitude, 'lng', longitude, 'at', recorded_at)
    order by recorded_at, created_at), '[]'::jsonb)
  into v_trajectory
  from public.service_locations where service_id = p_service_id;

  select count(*)::int4 as total,
    count(*) filter (where status = 'completed')::int4 as completed,
    count(*) filter (where status = 'skipped')::int4 as skipped,
    count(*) filter (where status in ('pending', 'next'))::int4 as unconfirmed
  into v_stops
  from public.service_stops where service_id = p_service_id;

  select count(*) filter (where attendance_status not in ('cancelled', 'not_required'))::int4 as total,
    count(*) filter (where attendance_status = 'boarded')::int4 as boarded,
    count(*) filter (where attendance_status = 'no_show')::int4 as no_show
  into v_pax
  from public.service_passengers where service_id = p_service_id;

  select count(*)::int4 into v_incidents from public.incidents
  where service_id = p_service_id and deleted_at is null;
  select count(*)::int4 into v_events from public.service_events where service_id = p_service_id;

  -- Anomalías (códigos; el panel los traduce en lib/service-audit.ts).
  if v_delay is not null and v_delay > 15 then
    v_anomalies := array_append(v_anomalies, 'late_start');
  end if;
  if v_actual_duration is not null and v_est_duration is not null and v_est_duration > 0 then
    if v_actual_duration > v_est_duration * 1.3 and v_actual_duration - v_est_duration > 10 then
      v_anomalies := array_append(v_anomalies, 'duration_over');
    elsif v_actual_duration < v_est_duration * 0.5 then
      v_anomalies := array_append(v_anomalies, 'duration_under');
    end if;
  end if;
  if v_points >= 2 and v_est_distance is not null and v_est_distance > 0
    and abs(v_distance - v_est_distance) / v_est_distance > 0.3 then
    v_anomalies := array_append(v_anomalies, 'distance_deviation');
  end if;
  if v_service.actual_start_at is not null and v_points = 0 then
    v_anomalies := array_append(v_anomalies, 'no_gps');
  elsif v_max_gap is not null and v_max_gap > 5 then
    v_anomalies := array_append(v_anomalies, 'gps_gaps');
  end if;
  if v_simulated > 0 then
    v_anomalies := array_append(v_anomalies, 'simulated_gps');
  end if;
  if v_stops.skipped > 0 then
    v_anomalies := array_append(v_anomalies, 'skipped_stops');
  end if;
  if v_service.status = 'completed' and v_stops.unconfirmed > 0 then
    v_anomalies := array_append(v_anomalies, 'unconfirmed_stops');
  end if;
  if v_pax.no_show > 0 then
    v_anomalies := array_append(v_anomalies, 'passenger_no_show');
  end if;
  if v_incidents > 0 then
    v_anomalies := array_append(v_anomalies, 'incidents');
  end if;
  if v_service.completion_source = 'admin' then
    v_anomalies := array_append(v_anomalies, 'closed_by_admin');
  end if;
  if v_service.status = 'cancelled' and v_service.actual_start_at is not null then
    v_anomalies := array_append(v_anomalies, 'cancelled_in_progress');
  end if;

  insert into public.service_metrics (
    service_id, company_id, scheduled_start_at, actual_start_at, actual_end_at, start_delay_minutes,
    estimated_duration_minutes, actual_duration_minutes, estimated_distance_km, actual_distance_km,
    location_points, simulated_points, max_location_gap_minutes, avg_speed_kmh, max_speed_kmh,
    stops_total, stops_completed, stops_skipped, stops_unconfirmed,
    passengers_total, passengers_boarded, passengers_no_show, incidents_count, events_count,
    anomalies, trajectory, consolidated_at
  ) values (
    p_service_id, v_service.company_id, v_scheduled_at, v_service.actual_start_at, v_service.actual_end_at, v_delay,
    round(v_est_duration, 1), v_actual_duration, v_est_distance, case when v_points >= 2 then v_distance end,
    v_points, v_simulated, v_max_gap,
    case when v_points >= 2 and v_actual_duration > 0 then round(v_distance / (v_actual_duration / 60), 1) end,
    v_max_speed,
    v_stops.total, v_stops.completed, v_stops.skipped, v_stops.unconfirmed,
    v_pax.total, v_pax.boarded, v_pax.no_show, v_incidents, v_events,
    v_anomalies, v_trajectory, now()
  )
  on conflict (service_id) do update set
    scheduled_start_at = excluded.scheduled_start_at,
    actual_start_at = excluded.actual_start_at,
    actual_end_at = excluded.actual_end_at,
    start_delay_minutes = excluded.start_delay_minutes,
    estimated_duration_minutes = excluded.estimated_duration_minutes,
    actual_duration_minutes = excluded.actual_duration_minutes,
    estimated_distance_km = excluded.estimated_distance_km,
    actual_distance_km = excluded.actual_distance_km,
    location_points = excluded.location_points,
    simulated_points = excluded.simulated_points,
    max_location_gap_minutes = excluded.max_location_gap_minutes,
    avg_speed_kmh = excluded.avg_speed_kmh,
    max_speed_kmh = excluded.max_speed_kmh,
    stops_total = excluded.stops_total,
    stops_completed = excluded.stops_completed,
    stops_skipped = excluded.stops_skipped,
    stops_unconfirmed = excluded.stops_unconfirmed,
    passengers_total = excluded.passengers_total,
    passengers_boarded = excluded.passengers_boarded,
    passengers_no_show = excluded.passengers_no_show,
    incidents_count = excluded.incidents_count,
    events_count = excluded.events_count,
    anomalies = excluded.anomalies,
    trajectory = excluded.trajectory,
    consolidated_at = excluded.consolidated_at
  returning * into v_metrics;

  return v_metrics;
end;
$function$;

-- Al cerrar el servicio (desde la app o el panel) se consolidan solas.
create or replace function public.handle_service_closed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_metrics public.service_metrics;
begin
  if new.status in ('completed', 'cancelled') and old.status is distinct from new.status then
    v_metrics := public.consolidate_service_metrics(new.id);
    insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
    values (new.company_id, new.id, 'system', null, 'metrics_consolidated',
      jsonb_build_object(
        'status', new.status,
        'actual_duration_minutes', v_metrics.actual_duration_minutes,
        'estimated_duration_minutes', v_metrics.estimated_duration_minutes,
        'actual_distance_km', v_metrics.actual_distance_km,
        'estimated_distance_km', v_metrics.estimated_distance_km,
        'location_points', v_metrics.location_points,
        'anomalies', to_jsonb(v_metrics.anomalies)
      ));
  end if;
  return null;
end;
$function$;

drop trigger if exists consolidate_metrics_on_close on public.services;
create trigger consolidate_metrics_on_close
  after update of status on public.services
  for each row
  execute function public.handle_service_closed();

-- Recalcular a pedido del admin (p. ej. tras corregir una parada).
create or replace function public.admin_consolidate_service_metrics(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services := public.lock_service_for_admin(p_service_id);
begin
  perform public.consolidate_service_metrics(v_service.id);
end;
$function$;

-- 12. Decisión de auditoría ----------------------------------------------------------------------------

create or replace function public.admin_audit_service(p_service_id uuid, p_decision text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services := public.lock_service_for_admin(p_service_id);
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_metrics public.service_metrics;
begin
  if p_decision not in ('approved', 'observed') then
    raise exception 'Decisión de auditoría no válida.';
  end if;
  if v_service.status not in ('completed', 'cancelled') then
    raise exception 'Solo se pueden auditar servicios finalizados o cancelados.';
  end if;
  if p_decision = 'observed' and v_notes is null then
    raise exception 'Escribe la observación para dejar el servicio observado.';
  end if;

  select * into v_metrics from public.service_metrics where service_id = p_service_id;
  if not found then
    v_metrics := public.consolidate_service_metrics(p_service_id);
  end if;

  insert into public.service_audits (company_id, service_id, decision, notes, audited_by_profile_id, metrics_snapshot)
  values (v_service.company_id, p_service_id, p_decision, v_notes, auth.uid(),
    to_jsonb(v_metrics) - 'trajectory');

  update public.services
  set audit_status = p_decision,
      audit_notes = v_notes,
      audited_at = now(),
      audited_by_profile_id = auth.uid()
  where id = p_service_id;

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'admin', auth.uid(), 'service_audited',
    jsonb_build_object('source', 'panel', 'decision', p_decision, 'notes', v_notes,
      'previous_audit_status', v_service.audit_status));

  insert into public.audit_logs (company_id, actor_type, actor_id, action, entity_type, entity_id, before_data, after_data)
  values (v_service.company_id, 'admin', auth.uid(), 'service_audited', 'service', p_service_id,
    jsonb_build_object('audit_status', v_service.audit_status, 'audit_notes', v_service.audit_notes),
    jsonb_build_object('audit_status', p_decision, 'audit_notes', v_notes));
end;
$function$;

-- 13. Permisos -----------------------------------------------------------------------------------------

revoke execute on function public.consolidate_service_metrics(uuid) from public, anon, authenticated;
revoke execute on function public.handle_service_closed() from public, anon, authenticated;

-- 14. Backfill: servicios ya cerrados quedan con métricas para auditarlos. -------------------------------

do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.services
    where status in ('completed', 'cancelled') and deleted_at is null
      and not exists (select 1 from public.service_metrics m where m.service_id = services.id)
  loop
    perform public.consolidate_service_metrics(v_id);
  end loop;
end $$;

-- 15. Realtime: la bolsa de viajes y las auditorías se ven en vivo. ----------------------------------------

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach v_table in array array['service_events', 'service_metrics'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;
