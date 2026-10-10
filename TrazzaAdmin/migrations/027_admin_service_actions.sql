-- Acciones del panel sobre un servicio (iniciar, finalizar, cancelar) en una
-- sola transacción. Antes eran 4-6 escrituras sueltas desde el navegador: si
-- una fallaba a mitad de camino quedaban servicios "en curso" con el vehículo
-- "disponible" (o al revés), y la bitácora nunca se guardaba porque insertaba
-- columnas inexistentes.
--
-- Patrón de aislamiento: current_profile_company_id() + current_profile_role()
-- = 'admin', igual que las policies de 001-024.

-- 1. Nuevo tipo de evento para la edición de programación (EditScheduleModal).
alter table public.service_events drop constraint if exists service_events_event_type_check;
alter table public.service_events
  add constraint service_events_event_type_check check (event_type in (
    'service_started', 'service_finished', 'service_cancelled', 'stop_arrived', 'stop_completed',
    'stop_skipped', 'passenger_boarded', 'passenger_no_show', 'incident_reported', 'vehicle_changed',
    'driver_changed', 'location_shared', 'note_added', 'schedule_updated'
  ));

-- 2. Helpers -----------------------------------------------------------------

-- Bloquea y devuelve el servicio si el usuario es admin de la misma empresa.
create or replace function public.lock_service_for_admin(p_service_id uuid)
returns public.services
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services;
begin
  if public.current_profile_role() is distinct from 'admin' then
    raise exception 'Solo un administrador puede hacer esto.';
  end if;

  select * into v_service from public.services
  where id = p_service_id
    and deleted_at is null
    and company_id = public.current_profile_company_id()
  for update;

  if not found then
    raise exception 'Este servicio ya no existe. Recarga la página.';
  end if;
  return v_service;
end;
$function$;

-- Deja disponibles el vehículo y el conductor de un servicio que se cierra,
-- salvo que estén en otro servicio en curso.
create or replace function public.release_service_resources(v_service public.services)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if v_service.vehicle_id is not null and not exists (
    select 1 from public.services
    where vehicle_id = v_service.vehicle_id and id <> v_service.id
      and status = 'in_progress' and deleted_at is null
  ) then
    update public.vehicles set status = 'available'
    where id = v_service.vehicle_id and status = 'in_service';
  end if;

  if v_service.driver_id is not null and not exists (
    select 1 from public.services
    where driver_id = v_service.driver_id and id <> v_service.id
      and status = 'in_progress' and deleted_at is null
  ) then
    update public.drivers set status = 'available'
    where id = v_service.driver_id and status = 'in_service';
  end if;
end;
$function$;

-- 3. Acciones ------------------------------------------------------------------

create or replace function public.admin_start_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services := public.lock_service_for_admin(p_service_id);
begin
  if v_service.status = 'in_progress' then
    raise exception 'Este servicio ya está en curso.';
  end if;
  if v_service.status <> 'scheduled' then
    raise exception 'Solo se pueden iniciar servicios programados.';
  end if;

  update public.services
  set status = 'in_progress', actual_start_at = now()
  where id = p_service_id;

  if v_service.vehicle_id is not null then
    update public.vehicles set status = 'in_service' where id = v_service.vehicle_id;
  end if;
  if v_service.driver_id is not null then
    update public.drivers set status = 'in_service' where id = v_service.driver_id;
  end if;

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'admin', auth.uid(), 'service_started',
    jsonb_build_object('source', 'panel'));
end;
$function$;

create or replace function public.admin_finish_service(p_service_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services := public.lock_service_for_admin(p_service_id);
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if v_service.status <> 'in_progress' then
    raise exception 'Solo se pueden finalizar servicios en curso.';
  end if;

  update public.services
  set status = 'completed',
      actual_end_at = now(),
      completion_source = 'admin',
      finalized_by_profile_id = auth.uid(),
      notes = case
        when v_notes is null then notes
        when notes is null then v_notes
        else notes || E'\n' || v_notes
      end
  where id = p_service_id;

  perform public.release_service_resources(v_service);

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'admin', auth.uid(), 'service_finished',
    jsonb_build_object('source', 'panel', 'notes', v_notes));
end;
$function$;

create or replace function public.admin_cancel_service(p_service_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services := public.lock_service_for_admin(p_service_id);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_service.status not in ('scheduled', 'in_progress') then
    raise exception 'Este servicio ya está cerrado.';
  end if;

  update public.services
  set status = 'cancelled',
      cancel_reason = v_reason,
      actual_end_at = case when v_service.status = 'in_progress' then now() else actual_end_at end
  where id = p_service_id;

  perform public.release_service_resources(v_service);

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'admin', auth.uid(), 'service_cancelled',
    jsonb_build_object('source', 'panel', 'previous_status', v_service.status, 'reason', v_reason));
end;
$function$;

-- Funciones internas: no se exponen como RPC.
revoke execute on function public.lock_service_for_admin(uuid) from public, anon, authenticated;
revoke execute on function public.release_service_resources(public.services) from public, anon, authenticated;
