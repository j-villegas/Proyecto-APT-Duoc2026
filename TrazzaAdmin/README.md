# TRAZZA Admin

Panel operacional de TRAZZA (Next.js + Supabase): flota, conductores, rutas,
incidentes y seguimiento en vivo. Comparte la base de datos con la app móvil
(`../TrazzaMobile`).

## Configuración

1. `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` y `DATABASE_URL` (no se sube a git).
2. `npm install`
3. `npm run db:migrate` aplica las migraciones pendientes (ver `migrations/README.md`).
4. `npm run dev` → http://localhost:3000

## Calidad

- `npm test` · `npm run test:db` · `npm run lint` · `npx tsc --noEmit` · `npm run build`
- Estrategia y pruebas pendientes: `docs/pruebas.md`

## Convenciones

- Errores: nunca mostrar `error.message` de Supabase; usar `friendlyError` (`lib/errors.ts`).
- Estados de servicio: `lib/service-status.ts` (mismo vocabulario y colores que la app).
- Colores: tokens de `app/globals.css` (`bg-surface`, `text-muted`, `bg-accent`…), no hex sueltos.
- Fechas: hora de Chile con `lib/date.ts`, nunca `new Date("YYYY-MM-DDTHH:mm")`.
- Acciones sobre servicios: funciones SQL `admin_*` (una transacción), no escrituras sueltas.
