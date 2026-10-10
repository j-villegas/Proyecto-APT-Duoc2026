-- Soporte para la app móvil TrazzaMobile (conductores y pasajeros) sobre el
-- mismo schema del panel. Antes la app tenía su propio proyecto de Supabase;
-- desde aquí ambos comparten esta base.
--
-- Patrón de aislamiento: se mantiene profiles.company_id vía
-- current_profile_company_id() para admin y conductores. Los pasajeros NO
-- heredan la visibilidad por empresa (verían RUT y datos de todos); solo ven
-- sus propios servicios mediante las policies "*_passenger" de abajo.
--
-- Las escrituras de la app (iniciar/finalizar servicio, paradas, ubicación,
-- incidentes) pasan por funciones security definer "mobile_*" que validan
-- que el servicio pertenezca al conductor/pasajero que llama. Así no se abren
-- policies de update a conductores sobre services/vehicles/drivers.
--
-- Cuentas: el panel no crea usuarios de Auth. Al crear un usuario en
-- Authentication > Users con el mismo correo de un conductor o pasajero
-- registrado en el panel, se le crea su perfil y se vincula automáticamente.

-- 1. Pasajeros con login ---------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'driver', 'passenger'));

alter table public.passengers
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;
create unique index if not exists idx_passengers_profile_id
  on public.passengers using btree (profile_id) where (profile_id is not null);

alter table public.incidents
  add column if not exists photo_urls text[] not null default '{}'::text[];

-- 2. Helpers ---------------------------------------------------------------

-- Igual que en 001, pero excluye pasajeros (ver encabezado).
create or replace function public.current_profile_company_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.company_id
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null
    and p.status = 'active'
    and p.role <> 'passenger'
  limit 1;
$function$;

create or replace function public.current_driver_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select d.id
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.profile_id = auth.uid()
    and d.deleted_at is null
    and p.deleted_at is null
    and p.status = 'active'
  order by d.created_at
  limit 1;
$function$;

create or replace function public.current_passenger_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select pa.id
  from public.passengers pa
  join public.profiles p on p.id = pa.profile_id
  where pa.profile_id = auth.uid()
    and pa.deleted_at is null
    and p.deleted_at is null
    and p.status = 'active'
  limit 1;
$function$;

create or replace function public.is_passenger_of_service(p_service_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.service_passengers sp
    where sp.service_id = p_service_id
      and sp.passenger_id = public.current_passenger_id()
  );
$function$;

-- 024 leía profiles.company_id directo, lo que habría dado acceso de
-- escritura a los pasajeros. Pasa al mismo helper que el resto de tablas.
drop policy if exists "contract_passengers_select_own_company" on public.contract_passengers;
drop policy if exists "contract_passengers_insert_own_company" on public.contract_passengers;
drop policy if exists "contract_passengers_update_own_company" on public.contract_passengers;

create policy "contract_passengers_select_own_company"
  on public.contract_passengers for select
  using (company_id = public.current_profile_company_id());

create policy "contract_passengers_insert_own_company"
  on public.contract_passengers for insert
  with check (company_id = public.current_profile_company_id());

create policy "contract_passengers_update_own_company"
  on public.contract_passengers for update
  using (company_id = public.current_profile_company_id());

-- 3. Lectura para pasajeros ------------------------------------------------

create policy "profiles_select_self"
  on public.profiles for select
  using (id = auth.uid());

create policy "passengers_select_self"
  on public.passengers for select
  using (profile_id = auth.uid());

create policy "service_passengers_select_passenger"
  on public.service_passengers for select
  using (passenger_id = public.current_passenger_id());

create policy "services_select_passenger"
  on public.services for select
  using (public.is_passenger_of_service(id));

create policy "service_stops_select_passenger"
  on public.service_stops for select
  using (public.is_passenger_of_service(service_id));

create policy "service_locations_select_passenger"
  on public.service_locations for select
  using (public.is_passenger_of_service(service_id));

create policy "routes_select_passenger"
  on public.routes for select
  using (exists (
    select 1 from public.services s
    where s.route_id = routes.id and public.is_passenger_of_service(s.id)
  ));

create policy "contracts_select_passenger"
  on public.contracts for select
  using (exists (
    select 1 from public.services s
    where s.contract_id = contracts.id and public.is_passenger_of_service(s.id)
  ));

create policy "vehicles_select_passenger"
  on public.vehicles for select
  using (exists (
    select 1 from public.services s
    where s.vehicle_id = vehicles.id and public.is_passenger_of_service(s.id)
  ));

create policy "incidents_select_passenger"
  on public.incidents for select
  using (reported_by_passenger_id = public.current_passenger_id());

-- El pasajero ve nombre y teléfono de su conductor, no la fila completa de
-- drivers (RUT, licencia, notas).
create or replace function public.get_service_driver(p_service_id uuid)
returns table (id uuid, full_name text, phone text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select d.id, d.full_name, d.phone
  from public.services s
  join public.drivers d on d.id = s.driver_id
  where s.id = p_service_id
    and (s.company_id = public.current_profile_company_id()
      or public.is_passenger_of_service(s.id));
$function$;

-- 4. Campos calculados (PostgREST los expone como columnas: select=mobile_eta)

create or replace function public.mobile_scheduled_at(s public.services)
returns timestamptz
language sql
stable
as $function$
  select (s.scheduled_date + coalesce(s.scheduled_start_time, time '00:00')) at time zone 'America/Santiago';
$function$;

create or replace function public.mobile_eta(s public.services)
returns timestamptz
language sql
stable
as $function$
  select case
    when s.scheduled_end_time is null then null
    else (s.scheduled_date + s.scheduled_end_time
      + case when s.scheduled_end_time < s.scheduled_start_time then interval '1 day' else interval '0' end)
      at time zone 'America/Santiago'
  end;
$function$;

-- security definer: el pasajero solo ve su propia fila de service_passengers,
-- pero el contador debe reflejar a todos los pasajeros del servicio.
create or replace function public.mobile_passenger_count(s public.services)
returns integer
language sql
stable security definer
set search_path to 'public'
as $function$
  select count(*)::int
  from public.service_passengers sp
  where sp.service_id = s.id
    and sp.attendance_status not in ('cancelled', 'not_required');
$function$;

create or replace function public.mobile_eta(st public.service_stops)
returns timestamptz
language sql
stable
as $function$
  select case
    when st.planned_arrival_time is null then null
    else (sv.scheduled_date + st.planned_arrival_time) at time zone 'America/Santiago'
  end
  from public.services sv
  where sv.id = st.service_id;
$function$;

create or replace function public.mobile_passenger_count(st public.service_stops)
returns integer
language sql
stable security definer
set search_path to 'public'
as $function$
  select count(*)::int
  from public.service_passengers sp
  where sp.service_stop_id = st.id
    and sp.attendance_status not in ('cancelled', 'not_required');
$function$;

-- 5. Escrituras del conductor ----------------------------------------------

create or replace function public.mobile_start_service(p_service_id uuid, p_odometer_km numeric default null)
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

  -- Ya iniciado (p. ej. desde el panel): el conductor simplemente continúa.
  if v_service.status = 'in_progress' then
    return;
  end if;
  if v_service.status <> 'scheduled' then
    raise exception 'El servicio ya no está programado.';
  end if;

  update public.services
  set status = 'in_progress', actual_start_at = now()
  where id = p_service_id;

  if v_service.vehicle_id is not null then
    update public.vehicles
    set status = 'in_service',
        current_odometer_km = coalesce(p_odometer_km, current_odometer_km)
    where id = v_service.vehicle_id;
  end if;

  update public.drivers set status = 'in_service' where id = v_driver;

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'driver', v_driver, 'service_started',
    jsonb_build_object('source', 'mobile', 'odometer_km', p_odometer_km));
end;
$function$;

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

  if v_service.vehicle_id is not null then
    update public.vehicles set status = 'available' where id = v_service.vehicle_id;
  end if;

  update public.drivers set status = 'available' where id = v_driver;

  insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
  values (v_service.company_id, p_service_id, 'driver', v_driver, 'service_finished',
    jsonb_build_object('source', 'mobile'));
end;
$function$;

create or replace function public.mobile_set_stop_status(p_stop_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_driver uuid := public.current_driver_id();
  v_stop public.service_stops;
  v_service public.services;
begin
  if p_status not in ('pending', 'arrived', 'completed', 'skipped') then
    raise exception 'Estado de parada no válido: %', p_status;
  end if;

  select * into v_stop from public.service_stops where id = p_stop_id for update;
  if not found then
    raise exception 'La parada no existe.';
  end if;

  select * into v_service from public.services where id = v_stop.service_id;
  if v_driver is null or v_service.driver_id is distinct from v_driver then
    raise exception 'La parada no pertenece a un servicio de este conductor.';
  end if;

  update public.service_stops
  set status = p_status,
      actual_arrival_at = case
        when p_status in ('arrived', 'completed') then coalesce(actual_arrival_at, now())
        else actual_arrival_at end,
      completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = p_stop_id;

  -- La siguiente parada pendiente queda marcada como 'next' para el panel.
  if p_status in ('completed', 'skipped') then
    update public.service_stops
    set status = 'next'
    where id = (
      select id from public.service_stops
      where service_id = v_stop.service_id and status = 'pending'
      order by stop_order
      limit 1
    );
  end if;

  if p_status <> 'pending' then
    insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
    values (v_service.company_id, v_service.id, 'driver', v_driver,
      case p_status when 'arrived' then 'stop_arrived' when 'completed' then 'stop_completed' else 'stop_skipped' end,
      jsonb_build_object('source', 'mobile', 'service_stop_id', p_stop_id));
  end if;
end;
$function$;

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

  insert into public.service_locations
    (company_id, service_id, driver_id, vehicle_id, latitude, longitude, speed_kmh, heading, accuracy_meters)
  values
    (v_service.company_id, p_service_id, v_driver, v_service.vehicle_id,
     p_latitude, p_longitude, p_speed_kmh, p_heading, p_accuracy_meters);
end;
$function$;

-- 6. Incidentes desde la app (conductor o pasajero) --------------------------

create or replace function public.mobile_report_incident(
  p_service_id uuid,
  p_category text,
  p_title text,
  p_description text,
  p_priority text default 'media',
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_photo_urls text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_driver uuid := public.current_driver_id();
  v_passenger uuid;
  v_company uuid;
  v_service public.services;
  v_type_name text;
  v_type_category text;
  v_type_id uuid;
  v_incident_id uuid;
begin
  if v_driver is not null then
    select company_id into v_company from public.drivers where id = v_driver;
  else
    v_passenger := public.current_passenger_id();
    if v_passenger is null then
      raise exception 'Tu cuenta no está asociada a un conductor ni a un pasajero.';
    end if;
    select company_id into v_company from public.passengers where id = v_passenger;
  end if;

  if p_service_id is not null then
    select * into v_service from public.services where id = p_service_id and deleted_at is null;
    if not found
      or (v_driver is not null and v_service.driver_id is distinct from v_driver)
      or (v_passenger is not null and not public.is_passenger_of_service(p_service_id)) then
      raise exception 'No puedes reportar incidentes en este servicio.';
    end if;
  end if;

  -- Categorías de la app -> tipos de incidente del panel (se crean si faltan).
  select t.name, t.category into v_type_name, v_type_category
  from (values
    ('frenada_brusca',        'Frenada brusca',              'driver'),
    ('conduccion_imprudente', 'Conducción imprudente',       'driver'),
    ('limpieza_unidad',       'Limpieza de la unidad',       'vehicle'),
    ('retraso_ruta',          'Retraso en ruta',             'route'),
    ('vehiculo',              'Problema con el vehículo',    'vehicle'),
    ('pasajero',              'Problema con pasajero',       'passenger'),
    ('ruta',                  'Problema en la ruta',         'route'),
    ('otro',                  'Otro',                        'operational')
  ) as t(key, name, category)
  where t.key = p_category;

  if v_type_name is null then
    v_type_name := 'Otro';
    v_type_category := 'operational';
  end if;

  insert into public.incident_types (company_id, name, category)
  values (v_company, v_type_name, v_type_category)
  on conflict (company_id, name) do nothing;

  select id into v_type_id from public.incident_types
  where company_id = v_company and name = v_type_name;

  insert into public.incidents (
    company_id, service_id, route_id, vehicle_id, driver_id, passenger_id, incident_type_id,
    reported_by_type, reported_by_profile_id, reported_by_driver_id, reported_by_passenger_id,
    severity, status, title, description, latitude, longitude, photo_urls
  ) values (
    v_company, p_service_id, v_service.route_id, v_service.vehicle_id,
    coalesce(v_service.driver_id, v_driver), v_passenger, v_type_id,
    case when v_driver is not null then 'driver' else 'passenger' end,
    auth.uid(), v_driver, v_passenger,
    case p_priority when 'baja' then 'low' when 'alta' then 'high' else 'medium' end,
    'open', p_title, p_description, p_latitude, p_longitude, coalesce(p_photo_urls, '{}'::text[])
  )
  returning id into v_incident_id;

  if p_service_id is not null then
    insert into public.service_events (company_id, service_id, actor_type, actor_id, event_type, payload)
    values (v_company, p_service_id,
      case when v_driver is not null then 'driver' else 'passenger' end,
      coalesce(v_driver, v_passenger), 'incident_reported',
      jsonb_build_object('source', 'mobile', 'incident_id', v_incident_id));
  end if;

  return v_incident_id;
end;
$function$;

-- 7. Vinculación de cuentas de Auth ----------------------------------------

create or replace function public.link_auth_user_to_mobile_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
  v_profile public.profiles;
  v_driver public.drivers;
  v_passenger public.passengers;
begin
  select lower(email) into v_email from auth.users where id = p_user_id;
  if v_email is null then
    return;
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if found then
    -- Perfil ya existente (creado a mano): solo completa el vínculo.
    if v_profile.role = 'driver' then
      update public.drivers set profile_id = p_user_id
      where profile_id is null and deleted_at is null
        and company_id = v_profile.company_id and lower(email) = v_email;
    elsif v_profile.role = 'passenger' then
      update public.passengers set profile_id = p_user_id
      where id = (
        select id from public.passengers
        where profile_id is null and deleted_at is null
          and company_id = v_profile.company_id and lower(email) = v_email
        order by created_at limit 1
      );
    end if;
    return;
  end if;

  select * into v_driver from public.drivers
  where profile_id is null and deleted_at is null and lower(email) = v_email
  order by created_at limit 1;
  if found then
    insert into public.profiles (id, company_id, full_name, email, phone, role)
    values (p_user_id, v_driver.company_id, v_driver.full_name, v_email, v_driver.phone, 'driver');
    update public.drivers set profile_id = p_user_id where id = v_driver.id;
    return;
  end if;

  select * into v_passenger from public.passengers
  where profile_id is null and deleted_at is null and lower(email) = v_email
  order by created_at limit 1;
  if found then
    insert into public.profiles (id, company_id, full_name, email, phone, role)
    values (p_user_id, v_passenger.company_id, v_passenger.full_name, v_email, v_passenger.phone, 'passenger');
    update public.passengers set profile_id = p_user_id where id = v_passenger.id;
  end if;
end;
$function$;

-- Nunca debe impedir crear un usuario de Auth: ante cualquier error, solo avisa.
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform public.link_auth_user_to_mobile_profile(new.id);
  exception when others then
    raise warning 'No se pudo vincular el usuario % con un conductor/pasajero: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created_link_mobile on auth.users;
create trigger on_auth_user_created_link_mobile
  after insert on auth.users
  for each row
  execute function public.handle_auth_user_created();

-- Caso inverso: el usuario de Auth ya existe y luego se registra (o corrige el
-- correo de) un conductor/pasajero en el panel.
create or replace function public.handle_mobile_person_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
begin
  if new.profile_id is null and new.email is not null then
    select id into v_user_id from auth.users where lower(email) = lower(new.email) limit 1;
    if v_user_id is not null then
      begin
        perform public.link_auth_user_to_mobile_profile(v_user_id);
      exception when others then
        raise warning 'No se pudo vincular % con su usuario de Auth: %', new.email, sqlerrm;
      end;
    end if;
  end if;
  return null;
end;
$function$;

drop trigger if exists link_driver_auth_user on public.drivers;
create trigger link_driver_auth_user
  after insert or update of email on public.drivers
  for each row
  execute function public.handle_mobile_person_email();

drop trigger if exists link_passenger_auth_user on public.passengers;
create trigger link_passenger_auth_user
  after insert or update of email on public.passengers
  for each row
  execute function public.handle_mobile_person_email();

-- Vincula los usuarios de Auth que ya existen.
do $$
declare
  v_user record;
begin
  for v_user in select id from auth.users loop
    perform public.link_auth_user_to_mobile_profile(v_user.id);
  end loop;
end $$;

-- 8. Fotos de incidentes -----------------------------------------------------

insert into storage.buckets (id, name, public)
values ('incident-photos', 'incident-photos', true)
on conflict (id) do nothing;

drop policy if exists "incident_photos_insert_own_folder" on storage.objects;
create policy "incident_photos_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'incident-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 9. Realtime (seguimiento en vivo del pasajero y del panel) -----------------

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach v_table in array array['service_locations', 'services', 'service_stops'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;
