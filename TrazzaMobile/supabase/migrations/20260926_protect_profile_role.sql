-- Impide que un usuario cambie su propio rol (pasajero -> conductor) o su rating.
-- Ejecutar una vez en bases creadas con una versión anterior de schema.sql.
revoke update on profiles from authenticated, anon;
grant update (full_name, phone, avatar_url) on profiles to authenticated;
