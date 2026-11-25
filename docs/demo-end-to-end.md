# Demo de extremo a extremo — TRAZZA

Guion para presentar en vivo el flujo real de operación:

1. El **Admin** registra pasajero, conductor y vehículo, y asigna el vehículo al conductor.
2. El **Admin** crea el viaje con conductor, vehículo y pasajeros.
3. **Conductor** y **Pasajero** ven el viaje asignado en su app.
4. El conductor lo inicia: el pasajero recibe el aviso y lo ve avanzar en el mapa.
5. Al terminar, el **Admin** audita el servicio.

Todo corre en local contra el Supabase del proyecto; el avance del conductor
se simula (no hay que salir a la calle).

## 1. Preparación (una vez, ~5 min)

En `TrazzaAdmin/.env.local` agrega tu cuenta de administrador (no se versiona):

```
DEMO_ADMIN_EMAIL=tu-admin@empresa.cl
DEMO_ADMIN_PASSWORD=tu-contraseña
```

```bash
cd TrazzaAdmin
npm run db:migrate          # aplica 030-031 si faltan
npm run demo:seed           # cuentas de prueba (idempotente)
npm run demo:check          # ensayo automático del flujo completo (~15 s)
```

`demo:check` debe terminar con **"Todo el flujo funciona"**: asigna un
vehículo al conductor demo, crea un viaje con el pasajero demo, lo inicia,
simula el recorrido, lo cierra y deja el viaje en Auditoría.

### Credenciales

| Rol | Dónde | Usuario | Contraseña |
| --- | --- | --- | --- |
| Admin | Panel web `http://localhost:3000` | tu cuenta de administrador | la tuya |
| Conductor | App móvil | `conductor.demo@demo.trazza.cl` | `TrazzaDemo2026` |
| Pasajero que se registra en vivo | App móvil | `pasajero.nuevo@demo.trazza.cl` (o el que indique `DEMO_NEW_PASSENGER_EMAIL`) | `TrazzaDemo2026` |
| Pasajero ya registrado (plan B) | App móvil | `pasajero.demo@demo.trazza.cl` | `TrazzaDemo2026` |

El panel no crea usuarios de login. `demo:seed` crea las cuentas de prueba;
para personas reales, crea el usuario en Supabase → Authentication con el
mismo correo registrado en el panel y se vincula solo.

Cada cuenta "pasajero nuevo" sirve **una vez**: queda vinculada al
registrarla. Para otra presentación usa otro correo:
`DEMO_NEW_PASSENGER_EMAIL=pasajero.nuevo4@demo.trazza.cl npm run demo:seed`.

### Pantallas a abrir antes de empezar

```bash
# Terminal 1
cd TrazzaAdmin && npm run dev                 # panel → http://localhost:3000
# Terminal 2 (recorrido simulado de 1,2 min, un punto por segundo)
cd TrazzaMobile && EXPO_PUBLIC_DEMO_SIM_MINUTES=1.2 EXPO_PUBLIC_DEMO_SIM_INTERVAL_S=1 npx expo start --web
```

- **Ventana A (normal):** panel Admin con la sesión iniciada.
- **Ventana B (normal):** app en `http://localhost:8081`, que será el **Pasajero**.
- **Ventana C (incógnito u otro navegador):** app en `http://localhost:8081`, que será el **Conductor**.
  Dos pestañas del mismo navegador comparten la sesión, así que el conductor va en incógnito.
  También puede ser un teléfono con Expo Go.

El mapa de la app web necesita una key de Google Maps que autorice
`http://localhost:8081/*` y tenga facturación activa (variable
`EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` en `TrazzaMobile/.env`).

Antes de cada presentación: `npm run demo:reset` (cancela viajes abiertos de
las cuentas demo).

## 2. Guion en vivo (~10 min)

### Paso 1 — Gestión en Admin (3 min)
1. **A → Pasajeros → Añadir Pasajero:**
   - Nombre (ej. "Ana Rojas") y un RUT nuevo.
   - **Correo (acceso app)** = la cuenta "pasajero nuevo".
   - Marca un **contrato** y guarda.
   - La columna *App móvil* pasa a **Con acceso**.
2. **A → Flota → Añadir Vehículo:** patente nueva, tipo Van, capacidad 12, estado **Disponible**.
3. **A → Conductores →** abre "Conductor Demo" → *Vehículos asignados* → marca el
   vehículo recién creado. Se guarda al instante; un conductor puede tener varios.

### Paso 2 — Crear y asignar el viaje (2 min)
1. **A → Rutas → Nueva ruta:**
   - Elige el **contrato** del paso 1; aparecen sus pasajeros.
   - Elige **Conductor Demo**: el vehículo se completa solo con su vehículo asignado.
   - Indica **origen** y **destino** (autocompletado de Google) y la ubicación de recogida de Ana.
   - Fecha de hoy y hora próxima → Guardar.
2. **C:** inicia sesión como `conductor.demo@…` → el viaje aparece en Inicio
   ("Próximo servicio") y en Rutas.
3. **B:** inicia sesión como el pasajero nuevo → "Tu próximo traslado" con el
   conductor y el vehículo → **Ver detalle** → **Estoy listo en el punto** (seguimiento).

### Paso 3 — Inicio, aviso en tiempo real y seguimiento (3 min)
1. **C:** **Ver ruta** → **Preparar ruta**. Escribe el kilometraje y marca las 4 verificaciones → **Iniciar ruta**.
2. **B:** aparece el aviso **"Tu conductor inició el viaje"** con la hora real.
3. **C:** activa **Modo demostración** (GPS simulado por las paradas). En cada
   parada toca **"Llegué a la parada"**.
4. **B:** el conductor **avanza en el mapa** en tiempo real. **A → Dashboard:**
   el mapa de flota también lo muestra.
5. **C:** en la última parada el viaje se finaliza solo. **B:** aparece el aviso **"Viaje finalizado"**.

### Paso 4 — Auditoría en Admin (2 min)
1. **A → Auditoría:** el viaje aparece con duración y distancia *estimado → real*,
   desviación, anomalías y estado **Sin auditar**. Filtros por conductor,
   vehículo, pasajero y anomalías.
2. Abre el viaje y muestra:
   - **Línea de vida:** creado y asignado (conductor, vehículo, pasajeros) → inicio → recorrido GPS → finalización.
   - **Estimado vs. real**, la **trayectoria** en el mapa y la **bitácora inmutable**.
   - La anomalía **"GPS simulado"**: el sistema detecta que el recorrido se generó en modo demo.
3. Escribe un comentario y toca **Aprobar**. El estado pasa a **Aprobado** y el
   historial registra quién y cuándo; no se puede editar ni borrar.

## 3. Si algo falla en vivo

| Síntoma | Solución rápida |
| --- | --- |
| El pasajero nuevo no puede entrar | El correo del pasajero debe ser exactamente el de la cuenta; en Pasajeros debe decir **Con acceso**. Plan B: `pasajero.demo@…`. |
| El pasajero no aparece al crear la ruta | Debe estar en el **contrato** elegido (Pasajeros → Editar → Contratos). |
| No se propone vehículo al elegir conductor | Asígnale vehículos en Conductores → detalle → *Vehículos asignados* (deben estar Disponibles). |
| No aparece "Modo demostración" | Las paradas del viaje no tienen coordenadas: elige origen/destino desde el autocompletado. |
| El mapa web no carga | Revisa la key web (origen `http://localhost:8081/*` y facturación). Plan B: Expo Go en el teléfono. |
| El recorrido simulado es muy largo/corto | `EXPO_PUBLIC_DEMO_SIM_MINUTES=…` y reiniciar Expo. |
