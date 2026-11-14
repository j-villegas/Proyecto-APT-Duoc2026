# Prompt: analizar TrazzaAdmin y TrazzaMobile contra Jira y aplicar lo pendiente

> Copia todo lo que está debajo de la línea y pégalo en una sesión nueva de Claude Code abierta en la raíz del repositorio `Proyecto-APT-Duoc2026`.

---

Eres un desarrollador senior que se suma al proyecto **Trazza** (Capstone Duoc 2026): un sistema de transporte de personal con un panel web para administradores (**TrazzaAdmin**, Next.js + Supabase) y una app móvil para conductores y pasajeros (**TrazzaMobile**, Expo / React Native + Supabase).

Tu trabajo tiene **dos fases**. No pases a la fase 2 hasta que yo apruebe el informe de la fase 1.

## Contexto que debes leer primero

1. `TrazzaAdmin/CLAUDE.md`, `TrazzaAdmin/AGENTS.md`, `TrazzaAdmin/README.md`
2. `TrazzaMobile/CLAUDE.md`, `TrazzaMobile/AGENTS.md`, `TrazzaMobile/README.md`
3. `README.md` de la raíz y la carpeta `docs/` (arquitectura, modelo de datos, plan de pruebas)
4. Las migraciones en `TrazzaAdmin/migrations/` para entender el esquema real (tablas, RLS, funciones, triggers)
5. `TrazzaMobile/src/types/database.ts` y `TrazzaMobile/src/services/` para ver cómo la app consume Supabase

Respeta las convenciones que encuentres (nombres, estructura de carpetas, estilo de comentarios, idioma de la UI en español).

## Historias pendientes en Jira (proyecto CAP)

Las historias ya marcadas como Done no se tocan salvo que estén rotas. Estas son las que faltan:

### Épica CAP-2 · App del conductor (Sprint 3)
- **CAP-12** Conductor inicia sesión y se vincula a su cuenta.
  CA: login con credenciales · ve su perfil con sus datos · credenciales incorrectas → mensaje de error.
- **CAP-13** Conductor ve sus servicios asignados del día.
  CA: solo servicios del día de ese conductor · muestra ruta, horario, vehículo · si no hay, lo indica claramente.
- **CAP-14** Conductor inicia y finaliza un servicio desde el teléfono.
  CA: marcar inicio · marcar término · cada cambio se refleja de inmediato en el panel admin.
- **CAP-15** Los estados del servicio se actualizan solos.
  CA: pasa de agendado a en curso sin clic extra · el cambio queda registrado con la hora real · el conductor ve siempre el estado actual.

### Épica CAP-3 · Seguimiento en tiempo real y ETA (Sprint 4)
- **CAP-17** Capturar GPS cada cierto intervalo durante un servicio en curso.
  CA: registra posición en intervalos regulares (~30 s) mientras está "en curso" · cada posición se guarda con fecha y hora · se detiene sola al finalizar o cancelar.
- **CAP-18** Admin ve la posición real de cada vehículo en el mapa del dashboard.
  CA: muestra vehículos con servicio en curso · se actualiza al llegar nuevas posiciones · vehículos sin servicio en curso no aparecen.
- **CAP-19** Pasajero y admin ven la hora estimada de llegada calculada con la posición real.
  CA: usa la posición actual, no un horario fijo · se recalcula con cada nueva posición · visible en la vista del pasajero y del admin.

### Épica CAP-4 · Vista del pasajero (Sprint 5)
- **CAP-20** Pasajero entra con su RUT y un código, sin crear cuenta.
  CA: entra con RUT + código del servicio · si es correcto accede a su servicio · si es incorrecto, error genérico sin revelar qué dato falló.
- **CAP-21** Pasajero ve el estado y la ubicación de su bus en el mapa.
  CA: ve el estado (agendado, en curso, completado) · si está en curso, ve el vehículo en el mapa · se actualiza a medida que se mueve.

### Épica CAP-5 · Panel de administración (In Progress)
- **CAP-48** Alerta automática cuando un servicio va atrasado.
  CA: compara ETA con horario planificado · si supera el margen definido, genera la alerta sin intervención manual · aparece en el dashboard junto a las demás alertas.

### Épica CAP-6 · Registro de evidencia (Sprints 5–6)
- **CAP-31** Admin ve el recorrido efectivamente realizado por un servicio.
  CA: el mapa muestra el recorrido real de un servicio finalizado · se arma con las posiciones guardadas · se compara visualmente contra la ruta planificada.
- **CAP-32** Detección de detenciones prolongadas.
  CA: revisa si el vehículo está detenido más del tiempo normal · si se supera, genera un evento de detención prolongada · el evento queda en el historial del servicio.
- **CAP-33** Historial auditable de cada servicio.
  CA: muestra eventos, paradas, pasajeros e incidentes · orden cronológico · no editable una vez finalizado el servicio (forzarlo en la base de datos, no solo en la UI).

### Épica CAP-7 · Documentación y pruebas (Sprint 6)
- **CAP-36** Pruebas automatizadas de los flujos críticos.
  CA: cubren login y ciclo del servicio · se ejecutan con resultado claro aprobado/fallido · quedan en el repositorio.
- **CAP-37** Pruebas integrales del flujo completo.
  CA: se ejecuta el caso simulado del Plan de Pruebas · se genera un reporte de resultados · los defectos quedan registrados con evidencia.
- **CAP-38** Sistema desplegado para la entrega final.
  CA: accesible desde una URL pública · funciona igual que en desarrollo · credenciales de prueba disponibles para el revisor.

## Fase 1 — Análisis (solo lectura, no modifiques código)

Para **cada historia** revisa el código real de ambas apps y la base de datos, y clasifícala en:

- ✅ **Cumplida**: todos los criterios de aceptación se cumplen. Indica los archivos que lo demuestran.
- 🟡 **Parcial**: indica qué criterio falta exactamente.
- ❌ **No implementada**.
- ⚠️ **Rota o con bug**: existe pero no funciona bien. Explica por qué.

No te fíes del estado de Jira ni de los nombres de archivos: verifica contra el código (por ejemplo, que la ubicación realmente se inserta en la tabla, que la RLS lo permite, que el admin está suscrito a los cambios en tiempo real).

Entrega un informe con:
1. Una tabla resumen: `Historia | Estado | Qué falta | Archivos clave | Esfuerzo (S/M/L)`.
2. Las dependencias entre historias (ej. CAP-17 → CAP-18 → CAP-19 → CAP-48 / CAP-21 / CAP-31 / CAP-32).
3. Los cambios de base de datos que necesites (nuevas migraciones, políticas RLS, funciones, triggers).
4. Las dudas o decisiones que necesiten mi respuesta (ej. margen de atraso para CAP-48, umbral de detención para CAP-32, formato del código de pasajero para CAP-20, plataforma de despliegue para CAP-38).
5. Un orden de implementación propuesto, agrupado en lotes pequeños.
6. Cualquier historia marcada como Done que esté rota.

Detente aquí y espera mi aprobación.

## Fase 2 — Implementación (solo después de que yo apruebe)

Antes de empezar, revisa `git status`. Si hay cambios sin commitear que no son tuyos, avísame y no los mezcles con tu trabajo. Trabaja en una rama nueva (`feature/jira-pendientes` o una por épica).

Para cada historia, en el orden acordado:
1. Implementa lo mínimo necesario para cumplir **todos** sus criterios de aceptación, sin refactorizar código que no lo necesite.
2. Los cambios de esquema van siempre como **migración nueva** en `TrazzaAdmin/migrations/`. Nunca edites migraciones ya aplicadas.
3. Mantén la seguridad: RLS en cada tabla nueva, ningún secreto en el código, el pasajero solo puede ver su propio servicio.
4. Agrega o actualiza las pruebas (Vitest en TrazzaAdmin, Jest en TrazzaMobile) que cubran los criterios de aceptación.
5. Ejecuta lint, typecheck y tests de la app afectada. Si algo falla, arréglalo antes de seguir. Nunca marques una historia como lista con pruebas fallando.
6. Haz un commit por historia con el formato `CAP-XX: descripción breve`.
7. Al terminar cada historia, resume en 2–3 líneas qué hiciste, cómo probarlo a mano y si queda algo pendiente.

Reglas generales:
- Si un criterio de aceptación es ambiguo o requiere una decisión de producto, **pregunta** en vez de suponer.
- Si algo necesita una acción mía (claves de API, aplicar migraciones en Supabase, configurar el hosting, probar en un dispositivo físico), detente y dime exactamente qué tengo que hacer.
- No hagas push ni despliegues sin mi confirmación.
- CAP-37 y CAP-38 requieren entorno real: prepara todo lo que se pueda (scripts, guía de despliegue, plantilla del reporte de pruebas, datos semilla) y deja indicado qué parte tengo que ejecutar yo.

Al final entrega una tabla de cierre con cada historia, su estado final y el commit correspondiente, lista para actualizar Jira.
