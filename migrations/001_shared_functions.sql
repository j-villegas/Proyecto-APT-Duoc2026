-- Funciones compartidas, usadas por las politicas RLS y triggers de las
-- migraciones siguientes. Reconstruido desde el schema real de Supabase.

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
  limit 1;
$function$;

create or replace function public.current_profile_role()
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null
    and p.status = 'active'
  limit 1;
$function$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
