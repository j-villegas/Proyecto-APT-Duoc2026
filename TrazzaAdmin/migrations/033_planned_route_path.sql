-- Ruta planificada por calles.
--
-- Al crear un viaje, el panel pide a Google Directions el recorrido real por
-- calles (origen → recogidas → bajadas → destino final) y lo guarda en el
-- servicio. Con eso:
--   - la app del pasajero y del conductor dibujan el camino en el mapa;
--   - el modo demostración del conductor simula el avance por las calles (y
--     no en línea recta entre paradas);
--   - la auditoría compara la distancia real contra la del recorrido por
--     calles (services.estimated_distance_km / estimated_duration_minutes).
-- Si Directions no está disponible, el viaje se crea igual sin recorrido.
--
-- planned_path: [[lat, lng], ...] (overview_path de Directions, ya simplificado).

alter table public.services add column if not exists planned_path jsonb;
alter table public.services drop constraint if exists services_planned_path_check;
alter table public.services
  add constraint services_planned_path_check check (planned_path is null or jsonb_typeof(planned_path) = 'array');

-- admin_create_route_service (032) + planned_path, planned_distance_km,
-- planned_duration_minutes opcionales en la entrada.
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
  v_plan jsonb := '[]'::jsonb;
  v_stop jsonb;
  v_order int := 0;
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

  -- Recorrido por calles calculado en el panel (Google Directions): la app lo
  -- dibuja y la auditoría lo usa como distancia y duración estimadas.
  if jsonb_typeof(p_input->'planned_path') = 'array' then
    if jsonb_array_length(p_input->'planned_path') > 5000 then
      raise exception 'El recorrido planificado es demasiado largo.';
    end if;
    if jsonb_array_length(p_input->'planned_path') >= 2 then
      update public.services
      set planned_path = p_input->'planned_path',
          estimated_distance_km = round(nullif(p_input->>'planned_distance_km', '')::numeric, 2),
          estimated_duration_minutes = ceil(nullif(p_input->>'planned_duration_minutes', '')::numeric)::int
      where id = v_service_id;
    end if;
  end if;

  -- Orden del recorrido: origen, recogidas (en el orden dado), bajadas de los
  -- pasajeros con destino propio (mismo orden) y destino final.
  v_plan := jsonb_build_array(jsonb_build_object('name', p_input->'origin'->>'name',
    'address', p_input->'origin'->>'address', 'lat', p_input->'origin'->'lat',
    'lng', p_input->'origin'->'lng', 'type', 'origin'));
  v_plan := v_plan || coalesce((
    select jsonb_agg((s - 'dropoff') || jsonb_build_object('type', 'pickup', 'idx', ord) order by ord)
    from jsonb_array_elements(v_stops) with ordinality as t(s, ord)), '[]'::jsonb);
  v_plan := v_plan || coalesce((
    select jsonb_agg(jsonb_build_object('name', s->>'name', 'address', s->'dropoff'->>'address',
      'lat', s->'dropoff'->'lat', 'lng', s->'dropoff'->'lng', 'type', 'dropoff', 'idx', ord) order by ord)
    from jsonb_array_elements(v_stops) with ordinality as t(s, ord)
    where nullif(trim(coalesce(s->'dropoff'->>'address', '')), '') is not null), '[]'::jsonb);
  v_plan := v_plan || jsonb_build_array(jsonb_build_object('name', p_input->'destination'->>'name',
    'address', p_input->'destination'->>'address', 'lat', p_input->'destination'->'lat',
    'lng', p_input->'destination'->'lng', 'type', 'destination'));

  for v_stop in select value from jsonb_array_elements(v_plan) loop
    v_order := v_order + 1;
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

    -- Bajada: se enlaza con el pasajero de la recogida del mismo índice.
    if v_stop->>'type' = 'dropoff' then
      update public.service_passengers sp
      set dropoff_stop_id = v_service_stop_id
      where sp.service_id = v_service_id
        and sp.passenger_id = nullif(v_stops->((v_stop->>'idx')::int - 1)->>'passenger_id', '')::uuid;
      continue;
    end if;

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
