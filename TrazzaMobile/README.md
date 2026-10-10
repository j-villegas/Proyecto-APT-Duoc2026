# TRAZZA Mobile

App móvil de TRAZZA — *rutas, flota y conductores en línea* — construida con Expo, React Native, TypeScript y Supabase. Incluye los flujos de **Pasajero** y **Conductor** definidos en los mockups del proyecto.

## Stack

- **Mobile:** Expo (SDK 57) + React Native + TypeScript
- **Backend:** Supabase (Auth, Postgres, Realtime, Storage)
- **Mapas y GPS:** `react-native-maps` (Google Maps) + `expo-location`
- **Navegación:** React Navigation (Bottom Tabs + Native Stack)

## Configuración

1. Copia `.env.example` a `.env` y completa las credenciales de Google Maps y de Supabase. **La app usa el mismo proyecto de Supabase que el panel web (`TrazzaAdmin`)**: copia `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` del `.env.local` del panel. El `.env` no se sube a git.
2. Instala dependencias:

   ```bash
   npm install
   ```

3. Base de datos: el schema vive en `TrazzaAdmin/migrations/` y se aplica desde el panel con `npm run db:migrate`. La migración `025_mobile_app.sql` agrega lo que necesita la app (pasajeros con login, funciones `mobile_*`, policies, realtime y el bucket `incident-photos`).
   - **Cuentas:** registra al conductor o pasajero en el panel **con su correo** y crea un usuario con ese mismo correo en **Authentication > Users**. La base crea el perfil y lo vincula sola (da igual el orden). Los administradores no pueden entrar a la app.
4. Restablecer contraseña: en **Authentication > URL Configuration > Redirect URLs** agrega `trazza://**`. El correo de recuperación abre la app en `trazza://reset-password`, donde el usuario define su nueva contraseña.

## Tests

```bash
npm test
```

Usa `jest-expo` + React Native Testing Library con un cliente de Supabase en memoria (`test/mockSupabase.ts`). Cubre el login por rol, el cambio de cuenta, las respuestas fuera de orden y el flujo completo de restablecer contraseña.

## Ejecutar la app

`react-native-maps` requiere configuración nativa (API key de Google Maps), por lo que **no funciona en Expo Go**. Usa un dev build:

```bash
npx expo run:android
# o
npx expo run:ios   # requiere macOS
```

Durante el desarrollo del JS/TS (sin tocar código nativo) puedes seguir iterando con:

```bash
npx expo start --dev-client
```

## Estructura

```
src/
  components/     Componentes de UI reutilizables (Card, Button, mapas, etc.)
  constants/      Tema de marca (colores, tipografía) y estilo del mapa
  context/        AuthContext (sesión + perfil/rol de Supabase)
  hooks/          Transmisión y suscripción a ubicación en tiempo real
  lib/            Cliente de Supabase
  navigation/     Stacks y Tabs (Auth, Pasajero, Conductor)
  screens/
    auth/         Login, Recuperar contraseña, Nueva contraseña
    passenger/    Inicio, Detalle de Viaje, Seguimiento en vivo, Historial, Perfil, Reportar Incidencia
    driver/       Inicio, Rutas Programadas, Detalle de Ruta, Preparar Servicio, En Ruta, Reportar Incidencia, Perfil
  services/       Queries a Supabase y traducción desde el schema del panel (mappers.ts)
  types/          Tipos de dominio (Service, Profile, Incident, etc.)
```

## Flujo por rol

El `RootNavigator` decide el flujo según el `role` del perfil autenticado (`profiles.role`: `driver` → conductor, `passenger` → pasajero):

- `pasajero` → Tabs: Inicio · Viaje (seguimiento en vivo) · Historial · Perfil
- `conductor` → Tabs: Inicio · Rutas · En ruta (mapa + transmisión GPS) · Perfil

La ubicación del conductor se registra en `service_locations` (función `mobile_report_location`) vía `useDriverLocationBroadcast` mientras tiene una ruta activa; el pasajero y el panel la reciben en tiempo real vía Supabase Realtime (`useDriverLocationSubscription`).

## Integración con el panel

| App | Base (panel) |
|---|---|
| `programado` / `en_ruta` / `finalizado` / `cancelado` | `services.status`: `scheduled` / `in_progress` / `completed` / `cancelled` |
| Iniciar / finalizar ruta | `mobile_start_service` / `mobile_finish_service` (también actualizan vehículo, conductor y `service_events`) |
| Paradas `pendiente` / `confirmada` / `completada` | `service_stops.status`: `pending`/`next` / `arrived` / `completed`/`skipped` (`mobile_set_stop_status`) |
| Origen y destino | `routes` del servicio |
| Pasajeros del viaje | `service_passengers` → `passengers.profile_id` |
| Incidencias | `mobile_report_incident` → `incidents` + `incident_types` (prioridad `baja/media/alta` → `low/medium/high`) |
