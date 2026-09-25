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

Antes de crear uno nuevo:
- Usa el siguiente número disponible (el próximo es `025`).
- Si toca RLS, deja explícito qué patrón de aislamiento asume (ej.
  `profiles.company_id` vía `current_profile_company_id()`) por si el
  proyecto cambia de convención.
