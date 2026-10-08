-- Datos de ejemplo para TRAZZA (ejecutar después de schema.sql).
-- IMPORTANTE: primero crea los usuarios en Supabase Auth (Authentication > Users):
--   juan@trazza.cl   -> pasajero
--   carlos@trazza.cl -> conductor
--
-- Los UUID se obtienen de auth.users por correo, así que no hay que copiarlos a mano.
-- El script es idempotente: si los perfiles quedaron cruzados (ej: juan@trazza.cl entraba
-- como Carlos) volver a ejecutarlo los corrige.
--
-- Diagnóstico (debe mostrar cada correo con su propio nombre y rol):
--   select u.email, u.id, p.full_name, p.role
--   from auth.users u left join public.profiles p on p.id = u.id
--   order by u.email;

do $$
declare
  v_juan uuid;
  v_carlos uuid;
begin
  select id into v_juan from auth.users where lower(email) = 'juan@trazza.cl';
  select id into v_carlos from auth.users where lower(email) = 'carlos@trazza.cl';

  if v_juan is null or v_carlos is null then
    raise exception 'Crea primero juan@trazza.cl y carlos@trazza.cl en Authentication > Users';
  end if;

  -- Perfiles: cada fila queda con los datos del dueño real del UUID.
  insert into profiles (id, full_name, role, phone, rating) values
    (v_juan, 'Juan Marchant', 'pasajero', '+56911111111', null),
    (v_carlos, 'Carlos Mendoza', 'conductor', '+56922222222', 4.9)
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    phone = excluded.phone,
    rating = excluded.rating;

  -- Un pasajero no conduce: reasigna al conductor lo que haya quedado a nombre de Juan.
  update vehicles set driver_id = v_carlos where driver_id = v_juan;
  update services set driver_id = v_carlos where driver_id = v_juan;
  delete from driver_locations where driver_id = v_juan;

  insert into vehicles (id, plate, brand, model, capacity, driver_id) values
    ('33333333-3333-3333-3333-333333333333', 'KRLW-88', 'Mercedes-Benz', 'Sprinter', 16, v_carlos)
  on conflict (id) do update set driver_id = excluded.driver_id;

  insert into services (
    id, code, contract_name, driver_id, vehicle_id,
    origin_label, origin_address, destination_label, destination_address,
    scheduled_at, eta, status, passenger_count
  ) values (
    '44444444-4444-4444-4444-444444444444', 'SRV-102', 'Shuttle Corporativo AM',
    v_carlos, '33333333-3333-3333-3333-333333333333',
    'Los Jardines 65', 'Los Jardines 65, Las Condes',
    'Fundación Arturo López Pérez', 'Av. Apoquindo 4501, Las Condes',
    (current_date + time '07:30') at time zone 'America/Santiago',
    (current_date + time '09:15') at time zone 'America/Santiago',
    'programado', 8
  )
  on conflict (id) do update set driver_id = excluded.driver_id, vehicle_id = excluded.vehicle_id;

  if not exists (select 1 from service_stops where service_id = '44444444-4444-4444-4444-444444444444') then
    insert into service_stops (service_id, order_index, label, address, eta, passenger_count, status) values
      ('44444444-4444-4444-4444-444444444444', 1, 'Sector Norte', 'Av. Kennedy 5600', (current_date + time '08:15') at time zone 'America/Santiago', 5, 'pendiente'),
      ('44444444-4444-4444-4444-444444444444', 2, 'Terminal Centro', 'Alameda 1200', (current_date + time '08:45') at time zone 'America/Santiago', 8, 'pendiente');
  end if;

  -- Un conductor no viaja como pasajero: pasa sus asignaciones a Juan.
  insert into trip_passengers (service_id, passenger_id, pickup_stop_id)
    select service_id, v_juan, pickup_stop_id from trip_passengers where passenger_id = v_carlos
  on conflict (service_id, passenger_id) do nothing;
  delete from trip_passengers where passenger_id = v_carlos;

  insert into trip_passengers (service_id, passenger_id) values
    ('44444444-4444-4444-4444-444444444444', v_juan)
  on conflict (service_id, passenger_id) do nothing;
end $$;
