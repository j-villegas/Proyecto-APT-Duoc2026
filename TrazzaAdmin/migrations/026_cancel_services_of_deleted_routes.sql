-- Al eliminar una ruta desde el panel (rutas/actions.ts marca
-- routes.deleted_at) sus servicios quedaban vivos: seguían asignados al
-- conductor y aparecían en la app móvil. Ahora los servicios pendientes de
-- una ruta eliminada se eliminan también (soft delete, igual que el panel).
-- Los servicios en curso o ya finalizados se conservan como historial.

create or replace function public.delete_services_of_deleted_route()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.services
    set deleted_at = new.deleted_at,
        status = 'cancelled',
        cancel_reason = coalesce(cancel_reason, 'Ruta eliminada')
    where route_id = new.id
      and deleted_at is null
      and status = 'scheduled';
  end if;
  return null;
end;
$function$;

drop trigger if exists delete_services_of_deleted_route on public.routes;
create trigger delete_services_of_deleted_route
  after update of deleted_at on public.routes
  for each row
  execute function public.delete_services_of_deleted_route();

-- Limpia los servicios de rutas que ya se eliminaron antes de este cambio.
update public.services s
set deleted_at = r.deleted_at,
    status = 'cancelled',
    cancel_reason = coalesce(s.cancel_reason, 'Ruta eliminada')
from public.routes r
where r.id = s.route_id
  and r.deleted_at is not null
  and s.deleted_at is null
  and s.status = 'scheduled';
