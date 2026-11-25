-- "Pasajero a bordo": al completar una parada de recogida, sus pasajeros
-- pendientes quedan abordados (attendance_status = 'boarded', boarded_at) y
-- la bitácora registra 'passenger_boarded'. Antes la parada quedaba completada
-- pero el pasajero seguía "Pendiente" en el panel y en la auditoría
-- (passengers_boarded = 0).

create or replace function public.board_passengers_on_pickup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service public.services;
  v_passenger record;
begin
  select * into v_service from public.services where id = new.service_id;

  for v_passenger in
    update public.service_passengers
    set attendance_status = 'boarded',
        boarded_at = coalesce(new.completed_at, now()),
        marked_by_driver_id = coalesce(marked_by_driver_id, v_service.driver_id)
    where service_stop_id = new.id and attendance_status = 'pending'
    returning id, passenger_id
  loop
    insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
    values (new.company_id, new.service_id,
      case when v_service.driver_id is null then 'system' else 'driver' end, v_service.driver_id,
      'passenger_boarded',
      jsonb_build_object('source', 'pickup', 'service_stop_id', new.id,
        'service_passenger_id', v_passenger.id, 'passenger_id', v_passenger.passenger_id));
  end loop;
  return new;
end;
$function$;

drop trigger if exists board_passengers_on_pickup on public.service_stops;
create trigger board_passengers_on_pickup
  after update of status on public.service_stops
  for each row
  when (new.stop_type = 'pickup' and new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.board_passengers_on_pickup();
