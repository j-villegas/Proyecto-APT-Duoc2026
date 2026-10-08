# TRAZZA Mobile

App móvil de TRAZZA — *rutas, flota y conductores en línea* — construida con Expo, React Native, TypeScript y Supabase. Incluye los flujos de **Pasajero** y **Conductor** definidos en los mockups del proyecto.

## Stack

- **Mobile:** Expo (SDK 57) + React Native + TypeScript
- **Backend:** Supabase (Auth, Postgres, Realtime, Storage)
- **Mapas y GPS:** `react-native-maps` (Google Maps) + `expo-location`
- **Navegación:** React Navigation (Bottom Tabs + Native Stack)

## Configuración

1. Copia `.env.example` a `.env` y completa las credenciales de Supabase / Google Maps (el `.env` real con las claves del proyecto ya está creado localmente y **no se sube a git**).
2. Instala dependencias:

   ```bash
   npm install
   ```

3. Configura la base de datos en Supabase:
   - Ejecuta `supabase/schema.sql` en el SQL Editor de Supabase (crea tablas, enums, RLS y realtime).
   - Crea un bucket de Storage llamado `incident-photos` (público para lectura) para las fotos de incidencias.
   - Crea los usuarios de prueba `juan@trazza.cl` (pasajero) y `carlos@trazza.cl` (conductor) en **Authentication > Users** y luego ejecuta `supabase/seed.sql`. El script busca los UUID por correo (no hay que copiarlos) y es idempotente: si los perfiles quedaron cruzados, volver a ejecutarlo los corrige.
   - En bases creadas con una versión anterior del esquema, ejecuta los archivos de `supabase/migrations/`: `20260926_protect_profile_role.sql` (impide que un usuario cambie su propio rol) y `20260926_service_coordinates.sql` (coordenadas del punto de recogida y destino; si quedan vacías, la app las obtiene desde la dirección).
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
  services/       Queries a Supabase (servicios/viajes, incidencias)
  types/          Tipos de dominio (Service, Profile, Incident, etc.)
supabase/
  schema.sql      Esquema completo + RLS + realtime
  seed.sql        Datos de ejemplo para probar el flujo end-to-end
```

## Flujo por rol

El `RootNavigator` decide el flujo según el `role` del perfil autenticado (`profiles.role`):

- `pasajero` → Tabs: Inicio · Viaje (seguimiento en vivo) · Historial · Perfil
- `conductor` → Tabs: Inicio · Rutas · En ruta (mapa + transmisión GPS) · Perfil

La ubicación del conductor se transmite a `driver_locations` vía `useDriverLocationBroadcast` mientras tiene una ruta activa, y el pasajero la recibe en tiempo real vía Supabase Realtime (`useDriverLocationSubscription`).
