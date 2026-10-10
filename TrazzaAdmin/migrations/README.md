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

Antes de crear uno nuevo:
- Usa el siguiente número disponible (el próximo es `027`).
- Si toca RLS, deja explícito qué patrón de aislamiento asume (ej.
  `profiles.company_id` vía `current_profile_company_id()`) por si el
  proyecto cambia de convención.
