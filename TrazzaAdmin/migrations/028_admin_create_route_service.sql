-- Crear ruta + servicio en una sola transacción (AddRouteModal).
-- Antes eran hasta 13 escrituras desde el navegador con "rollback" manual:
-- si fallaban las paradas del servicio o los pasajeros, quedaban rutas y
-- servicios a medio crear. Ahora, si algo falla, no se crea nada.
--
-- Entrada (jsonb):
-- {
--   "route_code": "R-010", "contract_id": uuid|null, "driver_id": uuid, "vehicle_id": uuid,
--   "scheduled_date": "2026-10-10", "scheduled_start_time": "08:30",
--   "origin":      { "name": "...", "address": "...", "lat": -23.6, "lng": -70.4 },
--   "destination": { "name": "...", "address": "...", "lat": null, "lng": null },
--   "stops": [ { "name": "...", "address": "...", "lat": ..., "lng": ..., "passenger_id": uuid|null } ]
-- }
-- Devuelve el id del servicio creado.

create or replace function public.admin_create_route_service(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid := public.current_profile_company_id();
  v_route_code text := nullif(trim(p_input->>'route_code'), '');
  v_contract uuid := nullif(p_input->>'contract_id', '')::uuid;
  v_driver uuid := nullif(p_input->>'driver_id', '')::uuid;
  v_vehicle uuid := nullif(p_input->>'vehicle_id', '')::uuid;
  v_route_id uuid;
  v_service_id uuid;
  v_stops jsonb := coalesce(p_input->'stops', '[]'::jsonb);
  v_stop jsonb;
  v_order int;
  v_passenger uuid;
  v_route_stop_id uuid;
  v_service_stop_id uuid;
  v_service_passenger_id uuid;
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if public.current_profile_role() is distinct from 'admin' or v_company is null then
    raise exception 'Solo un administrador puede crear rutas.';
  end if;
  if v_route_code is null then
    raise exception 'Ingresa el código de la ruta.';
  end if;
  if nullif(trim(p_input->'origin'->>'name'), '') is null or nullif(trim(p_input->'destination'->>'name'), '') is null then
    raise exception 'Indica el origen y el destino de la ruta.';
  end if;

  -- security definer salta RLS: validar a mano que todo sea de la empresa.
  if v_driver is not null and not exists (
    select 1 from public.drivers where id = v_driver and company_id = v_company and deleted_at is null
  ) then
    raise exception 'El conductor seleccionado ya no está disponible. Recarga la página.';
  end if;
  if v_vehicle is not null and not exists (
    select 1 from public.vehicles where id = v_vehicle and company_id = v_company and deleted_at is null
  ) then
    raise exception 'El vehículo seleccionado ya no está disponible. Recarga la página.';
  end if;
  if v_contract is not null and not exists (
    select 1 from public.contracts where id = v_contract and company_id = v_company and deleted_at is null
  ) then
    raise exception 'El contrato seleccionado ya no está disponible. Recarga la página.';
  end if;

  -- Ruta (un código repetido dispara 23505 routes_unique_code_per_company).
  insert into public.routes (company_id, contract_id, route_code, name, origin_name, origin_address,
    origin_latitude, origin_longitude, destination_name, destination_address,
    destination_latitude, destination_longitude, status)
  values (v_company, v_contract, v_route_code, v_route_code,
    trim(p_input->'origin'->>'name'), nullif(p_input->'origin'->>'address', ''),
    (p_input->'origin'->>'lat')::numeric, (p_input->'origin'->>'lng')::numeric,
    trim(p_input->'destination'->>'name'), nullif(p_input->'destination'->>'address', ''),
    (p_input->'destination'->>'lat')::numeric, (p_input->'destination'->>'lng')::numeric,
    'active')
  returning id into v_route_id;

  insert into public.services (company_id, contract_id, route_id, service_code, scheduled_date,
    scheduled_start_time, driver_id, vehicle_id, status)
  values (v_company, v_contract, v_route_id, v_route_code,
    (p_input->>'scheduled_date')::date, nullif(p_input->>'scheduled_start_time', '')::time,
    v_driver, v_vehicle, 'scheduled')
  returning id into v_service_id;

  -- Paradas: origen (1), intermedias (2..n+1), destino (n+2). Cada una se crea
  -- en el catálogo de la ruta y como parada del servicio.
  for v_order, v_stop in
    select 1, jsonb_build_object('name', p_input->'origin'->>'name', 'address', p_input->'origin'->>'address',
      'lat', p_input->'origin'->'lat', 'lng', p_input->'origin'->'lng', 'type', 'origin')
    union all
    select (ord + 1)::int, s || jsonb_build_object('type', 'pickup')
    from jsonb_array_elements(v_stops) with ordinality as t(s, ord)
    union all
    select jsonb_array_length(v_stops) + 2, jsonb_build_object('name', p_input->'destination'->>'name',
      'address', p_input->'destination'->>'address', 'lat', p_input->'destination'->'lat',
      'lng', p_input->'destination'->'lng', 'type', 'destination')
    order by 1
  loop
    insert into public.route_stops (company_id, route_id, stop_order, stop_type, name, address, latitude, longitude)
    values (v_company, v_route_id, v_order, v_stop->>'type', trim(v_stop->>'name'),
      nullif(v_stop->>'address', ''), (v_stop->>'lat')::numeric, (v_stop->>'lng')::numeric)
    returning id into v_route_stop_id;

    insert into public.service_stops (company_id, service_id, route_stop_id, stop_order, stop_type, name,
      address, latitude, longitude, status)
    values (v_company, v_service_id, v_route_stop_id, v_order, v_stop->>'type', trim(v_stop->>'name'),
      nullif(v_stop->>'address', ''), (v_stop->>'lat')::numeric, (v_stop->>'lng')::numeric, 'pending')
    returning id into v_service_stop_id;

    v_passenger := nullif(v_stop->>'passenger_id', '')::uuid;
    if v_passenger is not null then
      if not exists (
        select 1 from public.passengers where id = v_passenger and company_id = v_company and deleted_at is null
      ) then
        raise exception 'Uno de los pasajeros seleccionados ya no está disponible. Recarga la página.';
      end if;

      insert into public.service_passengers (company_id, service_id, passenger_id, service_stop_id, attendance_status)
      values (v_company, v_service_id, v_passenger, v_service_stop_id, 'pending')
      returning id into v_service_passenger_id;

      -- Código de acceso de 6 caracteres, único por empresa.
      loop
        select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
        into v_code from generate_series(1, 6);
        exit when not exists (
          select 1 from public.passenger_service_access where company_id = v_company and access_code = v_code
        );
      end loop;

      insert into public.passenger_service_access (company_id, service_id, passenger_id, service_passenger_id,
        access_code, status)
      values (v_company, v_service_id, v_passenger, v_service_passenger_id, v_code, 'active');
    end if;
  end loop;

  return v_service_id;
end;
$function$;
