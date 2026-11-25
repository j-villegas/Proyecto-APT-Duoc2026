# Migraciones

SQL de la base de datos (Supabase), versionado en el repo. Numeración
secuencial: `001_x.sql`, `002_y.sql`, etc. — el número indica el orden de
aplicación, no una fecha.

## Cómo correrlas

```
npm run db:migrate
```

Corre `scripts/migrate.mjs`: se conecta directo a Postgres (no usa el CLI
de Supabase), lleva registro de lo ya aplicado en una tabla
`public.schema_migrations`, y ejecuta solo los archivos de `migrations/`
que falten, en orden. No hace falta correrlos a mano nunca más — cada
`npm run db:migrate` aplica únicamente lo pendiente.

Requiere `DATABASE_URL` en `.env.local` (no se versiona, no lo agregué yo):
Supabase Dashboard → **Project Settings → Database → Connection string →
URI** (la conexión directa, puerto 5432 — no el pooler). Ejemplo:

```
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
```

La primera vez que corres el comando contra tu base real, detecta que las
tablas de 001–023 ya existen y las marca como aplicadas sin ejecutarlas
(ver sección siguiente). De ahí en adelante solo corre lo nuevo, como
`024_contract_passengers.sql`.

Si alguna vez apuntas `DATABASE_URL` a un proyecto de Supabase nuevo y
vacío (ej. staging), el mismo comando construye el schema completo desde
cero, migración por migración, sin necesidad de este "baseline".

## Origen de 001–023

Esas 23 tablas ya existían en producción (creadas a mano en el Table Editor
de Supabase, sin dejar SQL). Los archivos son una **reconstrucción fiel**,
generada a partir de un export real del schema (`information_schema` +
`pg_catalog`, incluyendo constraints, RLS, índices y triggers) corrido el
2026-08-22. No representan el orden histórico real en que se crearon, solo
un orden válido de dependencias para poder re-crear el schema desde cero
si hiciera falta (ej. en un ambiente nuevo).

`024_contract_passengers.sql` es distinto: es el único cambio de este set
que **todavía no está aplicado** en la base real — es la causa del error
"Could not find the table 'public.contract_passengers'" al asociar
pasajeros a un contrato. Hay que correrlo en el SQL Editor.

## 025: app móvil

`025_mobile_app.sql` conecta la app móvil (`TrazzaMobile`) a esta misma
base. Antes la app tenía su propio proyecto de Supabase.

- Los pasajeros pueden tener login (`profiles.role = 'passenger'`,
  `passengers.profile_id`). `current_profile_company_id()` devuelve `null`
  para ellos: no ven datos de la empresa, solo sus propios servicios
  (policies `*_passenger`).
- Conductores y pasajeros escriben solo mediante funciones `mobile_*`
  (security definer): iniciar/finalizar servicio, estado de paradas,
  ubicación GPS e incidentes. Cada función valida que el servicio sea
  del usuario que la llama, y registra en `service_events`.
- **Cuentas:** al crear un usuario en Authentication > Users con el mismo
  correo de un conductor o pasajero del panel, se crea su perfil y se
  vincula solo (también funciona en el orden inverso).
- Agrega `incidents.photo_urls`, el bucket `incident-photos` y realtime
  para `services`, `service_stops` y `service_locations`.
- Corrige las policies de `contract_passengers` (024) para que usen
  `current_profile_company_id()`.

Nota: en una base vacía, `001` falla porque sus funciones SQL referencian
`profiles` antes de que exista. Para construir el schema desde cero, corre
con `set check_function_bodies = off`.

## 026-028: acciones atómicas

- `026`: al eliminar una ruta, sus servicios **programados** se cancelan y
  marcan como eliminados (trigger). Los en curso o cerrados se conservan.
- `027`: `admin_start_service`, `admin_finish_service`, `admin_cancel_service`.
  Servicio, vehículo, conductor y bitácora en una sola transacción; solo admin
  de la misma empresa. Al cerrar, el vehículo/conductor se libera solo si no
  está en otro servicio en curso. Agrega el evento `schedule_updated`.
- `028`: `admin_create_route_service(jsonb)`: ruta, paradas, servicio,
  pasajeros y códigos de acceso en una transacción (antes eran ~13 escrituras
  desde el navegador).

**Los botones Iniciar / Finalizar / Cancelar / Añadir ruta del panel
dependen de 027 y 028**: corre `npm run db:migrate` antes de usarlos.

## 030-031: auditoría de servicios y vehículos por conductor

- `030` agrega la auditoría: al cerrar un servicio (app o panel) un trigger
  llena `service_metrics` con estimado vs. real (inicio, duración, distancia
  GPS, paradas, pasajeros, incidentes, trayectoria) y códigos de anomalía.
  `admin_audit_service(id, 'approved'|'observed', notas)` deja historial en
  `service_audits`, estado en `services.audit_status`, evento en la bitácora
  y registro en `audit_logs`. `service_events`, `service_locations` y
  `service_audits` son inmutables (trigger). `mobile_report_location` acepta
  `p_is_simulated` (GPS simulado del modo demo).
- `030` también agregó un flujo "bajo demanda" (el pasajero pedía viajes y
  un conductor los tomaba de una bolsa) que **`031` retira por completo**: no
  corresponde a la operación. Los viajes los crea y asigna el panel.
- `031` agrega `driver_vehicles`: vehículos que puede manejar cada conductor
  (muchos a muchos). El panel los propone al crear un viaje. Además, si un
  viaje no tiene duración estimada, se deriva de su distancia (30 km/h).

**La vista Auditoría, Pasajeros y la asignación de vehículos dependen de
030-031**: corre `npm run db:migrate` antes de usarlas.

## 032: recogidas y bajadas

- Recorrido de un viaje: **origen** (salida del conductor) → **recogida** de
  cada pasajero → **bajada** de quienes tienen destino propio → **destino
  final**. Nuevo tipo de parada `dropoff` y `service_passengers.dropoff_stop_id`
  (null = baja en el destino final; sin FK para no romper el embed
  `service_stops(...)` del panel).
- `admin_create_route_service` acepta `dropoff` por pasajero.
- Al iniciar el servicio, la parada de origen queda completada (salida) y la
  primera recogida pasa a ser la siguiente.

## 033-034: ruta por calles y pasajeros a bordo

- `033`: `services.planned_path` (`[[lat, lng], ...]`). Al crear un viaje, el
  panel pide el recorrido a Google Directions (requiere la API Directions en
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) y lo guarda junto con la distancia y
  duración estimadas. La app lo dibuja y el modo demostración lo recorre. Sin
  Directions, el viaje se crea igual (sin recorrido).
- `034`: al completar una recogida, sus pasajeros quedan `boarded` y la
  bitácora registra `passenger_boarded`.

## 035: regreso a la base

- Transporte de personal: el conductor sale de su base, recoge a la cuadrilla,
  deja a todos en el mismo destino y vuelve a la base. Nuevo tipo de parada
  `return` al final del recorrido cuando el viaje se crea con
  `return_to_origin: true` (casilla "El conductor regresa a la base al
  terminar" en el panel, marcada por defecto).

## Pruebas

`npm run test:db` levanta Postgres en memoria (PGlite), corre todas las
migraciones y prueba RLS y funciones (`tests/db`). Si cambias una migración
o una policy, agrega o ajusta un caso ahí.

Antes de crear uno nuevo:
- Usa el siguiente número disponible (el próximo es `036`).
- Si toca RLS, deja explícito qué patrón de aislamiento asume (ej.
  `profiles.company_id` vía `current_profile_company_id()`) por si el
  proyecto cambia de convención.
