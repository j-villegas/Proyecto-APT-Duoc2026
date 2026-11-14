-- Seguimiento GPS confiable (CAP-15 / CAP-17).
--
-- 1. mobile_report_location solo acepta posiciones mientras el servicio está
--    en curso: si el panel lo finaliza o cancela, la app deja de transmitir
--    (recibe el error y apaga el GPS) y no quedan pings "fantasma".
-- 2. Las policies de insert de 015/016 dejaban a cualquier usuario de la
--    empresa (incluidos conductores) escribir eventos y posiciones directo,
--    saltándose las validaciones de las funciones mobile_*. Ahora:
--    - service_events: insert directo solo para admin (lo usa el panel).
--    - service_locations: sin insert directo; solo vía mobile_report_location.
-- 3. mobile_finish_service libera vehículo y conductor con la misma regla que
--    el panel (release_service_resources de 027).

-- 1. Ubicación solo en servicios en curso -----------------------------------

create or replace function public.mobile_report_location(
  p_service_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_speed_kmh numeric default null,
  p_heading numeric default null,
  p_accuracy_meters numeric default null
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
    (company_id, service_id, driver_id, vehicle_id, latitude, longitude, speed_kmh, heading, accuracy_meters)
  values
    (v_service.company_id, p_service_id, v_driver, v_service.vehicle_id,
     p_latitude, p_longitude, p_speed_kmh, p_heading, p_accuracy_meters);
end;
$function$;

-- 2. Inserts directos ----------------------------------------------------------

drop policy if exists "service_events_admin_insert_own_company" on public.service_events;
create policy "service_events_admin_insert_own_company"
  on public.service_events for insert
  with check (company_id = current_profile_company_id() and current_profile_role() = 'admin');

drop policy if exists "service_locations_admin_insert_own_company" on public.service_locations;

-- 3. Finalizar desde la app ------------------------------------------------------

create or replace function public.mobile_finish_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_driver uuid := public.current_driver_id();
  v_service public.services;
begin
  if v_driver is null then
    raise exception 'Tu cuenta no está asociada a un conductor.';
  end if;

  select * into v_service from public.services
  where id = p_service_id and deleted_at is null
  for update;
  if not found or v_service.driver_id is distinct from v_driver then
    raise exception 'El servicio no está asignado a este conductor.';
  end if;

  if v_service.status = 'completed' then
    return;
  end if;
  if v_service.status <> 'in_progress' then
    raise exception 'El servicio no está en ejecución.';
  end if;

  update public.services
  set status = 'completed',
      actual_end_at = now(),
      completion_source = 'driver',
      finalized_by_profile_id = auth.uid()
  where id = p_service_id;

  perform public.release_service_resources(v_service);

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'driver', v_driver, 'service_finished',
    jsonb_build_object('source', 'mobile'));
end;
$function$;
