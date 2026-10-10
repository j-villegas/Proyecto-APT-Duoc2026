# Pruebas

## Qué hay hoy

| Comando | Qué cubre |
|---|---|
| `npm test` | Todo lo de abajo |
| `npm run test:db` | Migraciones 001-028 en Postgres en memoria: aislamiento de pasajeros (RLS), vinculación de cuentas, funciones de la app (`mobile_*`) y del panel (`admin_*`), eliminación de rutas |
| `tests/lib` | Lógica pura: fechas en hora de Chile, KPIs y cumplimiento, vocabulario de estados, traducción de errores, formato de patentes |
| `npm run lint` / `npx tsc --noEmit` | 0 problemas: mantenerlo así antes de cada commit |

La app móvil tiene su propia suite: `cd ../TrazzaMobile && npm test`.

## Pendiente: prueba de punta a punta (Playwright)

Necesita un proyecto de Supabase **de pruebas** (no producción) con un admin,
un conductor y un pasajero. Flujo a automatizar, en este orden:

1. Admin crea una ruta para hoy con conductor, vehículo y un pasajero.
2. Conductor (app web, `npx expo start` → `w`) prepara e inicia la ruta.
3. Panel: el servicio aparece "En ruta" sin recargar y el vehículo "En servicio".
4. Conductor completa las paradas y finaliza.
5. Panel: servicio "Finalizado", vehículo disponible, el cumplimiento sube.
6. Pasajero reporta una incidencia → aparece en Incidentes con origen "Pasajero".

## Pendiente: prueba de usabilidad

3 a 5 conductores reales, 15 minutos cada uno, pensando en voz alta:

- "Prepara e inicia tu ruta de hoy."
- "Llegaste a la segunda parada, regístralo."
- "Se pinchó un neumático: avísale a la central."
- "Terminaste: cierra la ruta."

Medir: tareas completadas sin ayuda, tiempo por tarea y dónde dudan.
