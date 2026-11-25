# Video demostrativo (flujo principal + auditoría)

Graba la app **real** corriendo en local (panel Admin + app móvil en web) con
Playwright y arma `demo-flujo-auditoria.mp4` con ffmpeg. No forma parte de la
app: vive aislado en esta carpeta (`node_modules/` y `raw/` no se versionan).

## Requisitos (una vez)

1. `TrazzaAdmin/.env.local` con tu cuenta de administrador (no se versiona):
   ```
   DEMO_ADMIN_EMAIL=tu-admin@empresa.cl
   DEMO_ADMIN_PASSWORD=tu-contraseña
   ```
2. La API key de Google Maps debe autorizar el origen de la app web:
   Google Cloud Console → APIs y servicios → Credenciales → la key →
   *Restricciones de sitios web* → agregar `http://localhost:8081/*`.
3. Cuentas de prueba: `cd TrazzaAdmin && npm run demo:seed`.
4. `cd demo && npm install && npx playwright install chromium`.

## Grabar

```bash
# Terminal 1
cd TrazzaAdmin && npm run dev
# Terminal 2 (recorrido simulado de 1,2 min, un punto por segundo)
cd TrazzaMobile && EXPO_PUBLIC_DEMO_SIM_MINUTES=1.2 EXPO_PUBLIC_DEMO_SIM_INTERVAL_S=1 npx expo start --web --port 8081
# Terminal 3
cd TrazzaAdmin && npm run demo:reset
cd ../demo && npm run video
```

- `record.mjs`: ejecuta el flujo y guarda los videos crudos en `raw/` y
  capturas reales en `capturas/`.
- `compose.mjs`: arma `demo-flujo-auditoria.mp4` (1920x1080, H.264).
- Prueba rápida sin Admin: `node record.mjs --mobile-only && node compose.mjs`.

El pasajero se habilita en vivo con `pasajero.nuevo@demo.trazza.cl`; esa
cuenta queda vinculada tras la primera grabación completa. Para volver a
grabar, usa otro correo con `DEMO_NEW_PASSENGER_EMAIL=...` (y corre
`demo:seed` para crear su cuenta).
