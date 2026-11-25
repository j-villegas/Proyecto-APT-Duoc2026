-- Modelo de operación real: los viajes los crea y asigna el panel.
--
-- 1. Se retira por completo el flujo "bajo demanda" agregado en 030 (el
--    pasajero solicitaba viajes y un conductor los tomaba de una bolsa). No
--    corresponde a la operación: el admin crea el viaje con conductor,
--    vehículo y pasajeros, y cada uno lo ve en su app. Se conservan de 030 la
--    auditoría, las métricas, la bitácora inmutable y el GPS simulado.
--    Los tipos de evento de la bolsa se mantienen en el check de
--    service_events solo porque hay filas históricas que los usan.
-- 2. Vehículos asignados a cada conductor (muchos a muchos: un conductor
--    puede manejar varios vehículos y un vehículo tener varios conductores).
--    El panel los propone al crear un viaje.
-- 3. La duración estimada de un viaje sin estimación propia se deriva de su
--    distancia estimada, para que la auditoría compare estimado vs. real.
--
-- Patrón de aislamiento: igual que 001-030 (current_profile_company_id() y
-- current_profile_role() = 'admin' para escribir).

-- 1. Retiro del flujo bajo demanda ---------------------------------------------

-- Solicitudes que nadie tomó: se cierran antes de quitar las columnas.
update public.services
set status = 'cancelled',
    cancel_reason = coalesce(cancel_reason, 'Flujo bajo demanda retirado')
where dispatch_mode = 'pool' and driver_id is null and status = 'scheduled' and deleted_at is null;

drop function if exists public.mobile_request_service(jsonb);
drop function if exists public.mobile_cancel_request(uuid, text);
drop function if exists public.admin_publish_service(uuid);
drop function if exists public.mobile_accept_service(uuid, uuid);
drop function if exists public.estimate_trip(numeric, numeric, numeric, numeric);

drop index if exists public.idx_services_pool;
alter table public.services drop constraint if exists services_dispatch_mode_check;
alter table public.services drop constraint if exists services_request_source_check;
alter table public.services
  drop column if exists dispatch_mode,
  drop column if exists request_source,
  drop column if exists requested_by_passenger_id,
  drop column if exists requested_at,
  drop column if exists published_at,
  drop column if exists accepted_at,
  drop column if exists accepted_by_driver_id,
  drop column if exists origin_name,
  drop column if exists origin_address,
  drop column if exists origin_latitude,
  drop column if exists origin_longitude,
  drop column if exists destination_name,
  drop column if exists destination_address,
  drop column if exists destination_latitude,
  drop column if exists destination_longitude;

-- 2. Vehículos asignados a conductores -----------------------------------------

create table if not exists public.driver_vehicles (
  company_id uuid not null,
  driver_id uuid not null,
  vehicle_id uuid not null,
  -- Sin FK a profiles: solo informativo (quién asignó).
  assigned_by_profile_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint driver_vehicles_pkey primary key (driver_id, vehicle_id),
  constraint driver_vehicles_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict,
  constraint driver_vehicles_driver_id_fkey foreign key (driver_id) references public.drivers(id) on delete cascade,
  constraint driver_vehicles_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete cascade
);

create index if not exists idx_driver_vehicles_vehicle_id on public.driver_vehicles using btree (vehicle_id);
create index if not exists idx_driver_vehicles_company_id on public.driver_vehicles using btree (company_id);

alter table public.driver_vehicles enable row level security;

create policy "driver_vehicles_select_own_company"
  on public.driver_vehicles for select
  using (company_id = current_profile_company_id());

-- El conductor y el vehículo deben ser de la misma empresa que la asignación.
create policy "driver_vehicles_admin_insert_own_company"
  on public.driver_vehicles for insert
  with check (
    company_id = current_profile_company_id() and current_profile_role() = 'admin'
    and exists (select 1 from public.drivers d where d.id = driver_id and d.company_id = driver_vehicles.company_id)
    and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.company_id = driver_vehicles.company_id)
  );

create policy "driver_vehicles_admin_delete_own_company"
  on public.driver_vehicles for delete
  using (company_id = current_profile_company_id() and current_profile_role() = 'admin');

-- 3. Duración estimada derivada de la distancia ---------------------------------

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

  -- Sin estimación de duración: se deriva de la distancia (30 km/h, mínimo 5 min).
  if v_est_duration is null and v_est_distance is not null then
    v_est_duration := greatest(5, ceil(v_est_distance / 30 * 60));
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

revoke execute on function public.consolidate_service_metrics(uuid) from public, anon, authenticated;
