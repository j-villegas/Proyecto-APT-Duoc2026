-- Coordenadas del punto de recogida y destino de cada servicio (opcionales).
-- Si quedan vacías, la app obtiene la ubicación a partir de la dirección.
alter table services
  add column if not exists origin_latitude double precision,
  add column if not exists origin_longitude double precision,
  add column if not exists destination_latitude double precision,
  add column if not exists destination_longitude double precision;
