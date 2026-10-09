# Planificación del proyecto (Jira) — TRAZZA

> Estado: **Completo**. Product Backlog (41 historias en 7 épicas) y Sprint Backlog (6 sprints con fechas, Sprint 1 cerrado y Sprint 2 activo) ya están cargados en Jira.

## 1. Qué pide el entregable (punto 2)

"Planificación del proyecto según metodología, apoyándose en Jira". El equipo usa **Scrum adaptado**, así que se entrega:

- **Product Backlog:** historias de usuario, tareas, prioridades y responsables.
- **Sprint Backlog:** lo que entra a cada sprint y su planificación.
- **Carta Gantt (opcional):** el enunciado la lista junto a los backlogs; parece ser la alternativa para equipos sin Scrum. Como respaldo, se exporta la vista *Timeline* de Jira.

## 2. Configuración de Jira

| Elemento | Definición |
|---|---|
| Proyecto | Espacio "Capstone Trazza" (clave `CAP`) |
| Miembros | José Villegas, Juan Marchant, Franz Figueroa |
| Flujo de estados | Por hacer → En curso → En revisión → Hecho |
| Estimación | Puntos de historia, escala Fibonacci (1, 2, 3, 5, 8) |
| Prioridad | Alta / Media / Baja, con las mismas definiciones que el Plan de Pruebas |
| Definición de "Hecho" | Código en `main` vía pull request revisado, criterios de aceptación cumplidos, caso de prueba asociado ejecutado, documentación al día |

## 3. Épicas

| ID interno | Clave en Jira | Épica | Origen |
|---|---|---|---|
| E0 | `CAP-1` | Base técnica: entorno, base de datos, autenticación, Dockerización | Sprint 1 |
| E1 | `CAP-2` | App del conductor | Alcance 01 del PPT |
| E2 | `CAP-3` | Seguimiento en tiempo real y hora estimada de llegada | Alcance 02 |
| E3 | `CAP-4` | Vista del pasajero | Alcance 03 |
| E4 | `CAP-5` | Panel de administración | Alcance 04 |
| E5 | `CAP-6` | Registro de evidencia | Alcance 05 |
| E6 | `CAP-7` | Documentación y pruebas | Entregables del curso |

Ya creadas en Jira, estado To Do, sin asignar.

## 4. Sprints

Fechas **supuestas**: la semana 9 se tomó como la del 5 al 9 de octubre, según la demo del enunciado. Confirmar con el calendario académico.

| Sprint | Semanas | Fechas (supuestas) | Foco según el PPT |
|---|---|---|---|
| 1 | 5–6 | 7 al 18 sep | Configuración de bases y entorno |
| 2 | 7–8 | 21 sep al 2 oct | Backend y API inicial |
| 3 | 9–10 | 5 al 16 oct | GPS en tiempo real y lo pendiente de la app del conductor. **Demo con ≥50% de avance** (semana del 9 oct) y hito de control de la semana 10 |
| 4 | 11–12 | 19 al 30 oct | Panel web y vista del pasajero |
| 5 | 13–14 | 2 al 13 nov | Pruebas integrales del flujo |
| 6 | 15 | 16 al 20 nov | Ajustes finales y despliegue. Hito final |

Se está en el **Sprint 2**. Los sprints 1 y 2 concentran el trabajo ya avanzado (panel, migraciones, login) y son los únicos que necesariamente cargan más puntos: entre los dos deben sumar el 50% del proyecto para la demo del 9 de octubre (semana 9, dentro del Sprint 3), aunque ese sprint recién empieza esa semana. A partir del Sprint 3 la carga queda pareja entre sprints, porque ahí sí es trabajo nuevo.

| Sprint | Puntos | % del total | Nota |
|---|---|---|---|
| 1 | 51 | 25% | Base técnica + mitad del panel de administración (ya construido) |
| 2 | 54 | 26% | Resto del panel de administración + documentación (Plan de Pruebas, modelo de datos, arquitectura) |
| **Acumulado a la demo (9 oct)** | **105** | **51%** | Cumple el mínimo del 50% |
| 3 | 21 | 10% | App del conductor: login, servicios del día, iniciar/finalizar, auto-actualización |
| 4 | 24 | 12% | Captura y visualización GPS en tiempo real |
| 5 | 29 | 14% | Vista del pasajero + inicio de registro de evidencia |
| 6 | 26 | 13% | Cierre de evidencia, pruebas automatizadas, pruebas integrales, despliegue |

## 5. Ceremonias

| Ceremonia | Cuándo | Salida |
|---|---|---|
| Planificación del sprint | Primer día del sprint | Sprint Backlog con historias y responsables |
| Seguimiento breve | Dos veces por semana | Estados actualizados en Jira |
| Revisión del sprint | Último día | Demo funcional |
| Retrospectiva | Tras la revisión | Mejoras anotadas |

## 6. Responsables

- Mantención de Jira, backlogs y documentación de la planificación: José Villegas.
- Desarrollo de historias: se asigna en la planificación de cada sprint entre los tres.

## 7. Product Backlog

Formato de cada historia: "Como [rol], quiero [función] para [beneficio]". Los IDs `H01…` son provisorios: Jira asigna después las claves `CAP-n`. El responsable se define en la planificación de cada sprint.

Todas las historias parten en **Por hacer**. Las de los sprints S1 y S2 corresponden a módulos que ya existen en el repo; el equipo comprueba cada una funcionando y marca su estado al conectarse.

### E0 — Base técnica

| ID | Clave Jira | Historia | Criterio de aceptación | Prior. | Pts | Sprint | Estado |
|---|---|---|---|---|---|---|---|
| H01 | `CAP-8` | Como equipo, quiero el esquema de base de datos versionado para recrear el entorno en cualquier máquina | `npm run db:migrate` construye el esquema completo en un Supabase vacío | Alta | 8 | S1 | Por hacer |
| H02 | `CAP-9` | Como administrador, quiero iniciar sesión para acceder al panel de mi empresa | Sin sesión se redirige a `/login`; solo el rol `admin` entra al panel | Alta | 5 | S1 | Por hacer |
| H03 | `CAP-10` | Como equipo, quiero el proyecto dockerizado para levantarlo igual en cualquier equipo | `docker compose up` deja el panel funcionando | Alta | 5 | S1 | Por hacer |
| H04 | `CAP-11` | Como equipo, quiero un `.env.example` y un README con la puesta en marcha para incorporar gente rápido | Un integrante nuevo levanta el proyecto siguiendo solo el README | Media | 2 | S1 | Por hacer |

### E1 — App del conductor

| ID | Clave Jira | Historia | Criterio de aceptación | Prior. | Pts | Sprint | Estado |
|---|---|---|---|---|---|---|---|
| H05 | `CAP-12` | Como conductor, quiero iniciar sesión en la app y vincularme a mi cuenta | Un conductor registrado entra y ve su perfil | Alta | 5 | S3 | Por hacer |
| H06 | `CAP-13` | Como conductor, quiero ver mis servicios asignados del día | La lista muestra solo los servicios de hoy asignados a mí | Alta | 5 | S3 | Por hacer |
| H07 | `CAP-14` | Como conductor, quiero iniciar y finalizar un servicio desde el teléfono | Cambiar el estado se refleja en el panel | Alta | 8 | S3 | Por hacer |
| H08 | `CAP-15` | Como conductor, quiero que los estados del servicio se actualicen solos | El servicio pasa de agendado a en curso sin acción manual extra | Media | 3 | S3 | Por hacer |

### E2 — Seguimiento en tiempo real y hora estimada de llegada

| ID | Clave Jira | Historia | Criterio de aceptación | Prior. | Pts | Sprint | Estado |
|---|---|---|---|---|---|---|---|
| H09 | `CAP-16` | Como conductor, quiero conceder permisos de ubicación al dispositivo | La app solicita el permiso y explica para qué se usa | Alta | 3 | S2 | Por hacer |
| H10 | `CAP-17` | Como sistema, quiero capturar la ubicación GPS cada cierto intervalo durante un servicio en curso | Se guardan posiciones en `service_locations` mientras el servicio está activo | Alta | 8 | S4 | Por hacer |
| H11 | `CAP-18` | Como administrador, quiero ver la posición real de cada vehículo en el mapa del dashboard | El mapa muestra los vehículos en curso y se actualiza en vivo | Alta | 8 | S4 | Por hacer |
| H12 | `CAP-19` | Como pasajero y administrador, quiero ver la hora estimada de llegada calculada con la posición real | La hora se recalcula con cada nueva posición | Alta | 8 | S4 | Por hacer |

### E3 — Vista del pasajero

| ID | Clave Jira | Historia | Criterio de aceptación | Prior. | Pts | Sprint | Estado |
|---|---|---|---|---|---|---|---|
| H13 | `CAP-20` | Como pasajero, quiero entrar con mi RUT y un código, sin crear cuenta | RUT y código válidos dan acceso; inválidos, no | Alta | 8 | S5 | Por hacer |
| H14 | `CAP-21` | Como pasajero, quiero ver el estado y la ubicación de mi bus en el mapa | Se ven el estado del servicio y la posición del vehículo | Alta | 8 | S5 | Por hacer |

### E4 — Panel de administración

| ID | Clave Jira | Historia | Criterio de aceptación | Prior. | Pts | Sprint | Estado |
|---|---|---|---|---|---|---|---|
| H15 | `CAP-22` | Como administrador, quiero ver KPIs del día (flota activa, cumplimiento, alertas críticas, combustible) | Los indicadores reflejan los datos de la empresa | Alta | 5 | S1 | Por hacer |
| H16 | `CAP-23` | Como administrador, quiero ver un mapa de Google en el dashboard | El mapa carga y muestra el contexto operacional | Media | 3 | S1 | Por hacer |
| H17 | `CAP-24` | Como administrador, quiero ver alertas operacionales (licencia por vencer, mantención crítica, servicio atrasado, incidencia crítica) | Las alertas aparecen en el dashboard y se pueden abrir | Alta | 3 | S1 | Por hacer |
| H18 | `CAP-25` | Como administrador, quiero registrar y ver detalle de vehículos | Un vehículo nuevo queda guardado y se ve su ficha | Alta | 5 | S1 | Por hacer |
| H19 | `CAP-26` | Como administrador, quiero registrar cargas de combustible y ver su historial | La carga queda en `fuel_logs` y suma en el KPI del día | Media | 3 | S1 | Por hacer |
| H20 | `CAP-27` | Como administrador, quiero registrar órdenes de mantención | La orden queda asociada al vehículo | Media | 3 | S1 | Por hacer |
| H21 | `CAP-28` | Como administrador, quiero registrar y ver detalle de conductores | Un conductor nuevo queda guardado y se ve su ficha | Alta | 5 | S1 | Por hacer |
| H22 | `CAP-29` | Como administrador, quiero recibir alerta cuando una licencia vence en 30 días | La alerta aparece 30 días antes del vencimiento | Media | 2 | S1 | Por hacer |
| H23 | `CAP-30` | Como administrador, quiero ver el historial de servicios de cada conductor | El historial lista los servicios pasados | Baja | 2 | S1 | Por hacer |
| H24 | `CAP-40` | Como administrador, quiero crear contratos y asociarles pasajeros | El contrato guarda sus pasajeros (`contract_passengers`) | Alta | 5 | S2 | Por hacer |
| H25 | `CAP-41` | Como administrador, quiero crear rutas con direcciones autocompletadas | La ruta guarda sus paradas con dirección válida | Alta | 5 | S2 | Por hacer |
| H26 | `CAP-42` | Como administrador, quiero iniciar, finalizar y cancelar un servicio | Cada cambio queda en la bitácora de eventos | Alta | 8 | S2 | Por hacer |
| H27 | `CAP-43` | Como administrador, quiero gestionar los pasajeros de un servicio | Se agregan y quitan pasajeros del servicio | Media | 3 | S2 | Por hacer |
| H28 | `CAP-44` | Como administrador, quiero reportar un incidente durante un servicio | El incidente queda registrado con su tipo | Media | 3 | S2 | Por hacer |
| H29 | `CAP-45` | Como administrador, quiero editar el horario de un servicio | El nuevo horario se guarda y se muestra | Baja | 2 | S2 | Por hacer |
| H30 | `CAP-46` | Como administrador, quiero editar los datos de mi empresa | Los cambios quedan guardados | Baja | 2 | S2 | Por hacer |
| H31 | `CAP-47` | Como administrador, quiero indicadores con datos reales de terreno | Los KPIs usan los datos capturados por la app | Media | 5 | S2 | Por hacer |
| H32 | `CAP-48` | Como administrador, quiero una alerta automática cuando un servicio va atrasado | La alerta se genera sin acción manual | Alta | 5 | S2 | Por hacer |

### E5 — Registro de evidencia

| ID | Clave Jira | Historia | Criterio de aceptación | Prior. | Pts | Sprint | Estado |
|---|---|---|---|---|---|---|---|
| H33 | `CAP-31` | Como administrador, quiero ver el recorrido efectivamente realizado por un servicio | El mapa dibuja la ruta real con las posiciones guardadas | Media | 5 | S5 | Por hacer |
| H34 | `CAP-32` | Como administrador, quiero detección de detenciones prolongadas | Una detención sobre el umbral genera un evento | Media | 8 | S5 | Por hacer |
| H35 | `CAP-33` | Como administrador, quiero un historial auditable de cada servicio | El historial reúne eventos, paradas, pasajeros e incidentes | Alta | 5 | S6 | Por hacer |

### E6 — Documentación y pruebas

| ID | Clave Jira | Historia | Criterio de aceptación | Prior. | Pts | Sprint | Estado |
|---|---|---|---|---|---|---|---|
| H36 | `CAP-34` | Como equipo, quiero el Plan de Pruebas documentado | Documento con tipos, estrategia, herramientas y casos | Alta | 5 | S2 | Por hacer |
| H37 | `CAP-35` | Como equipo, quiero el modelo de datos documentado (ER, lógico, físico) | Los tres modelos entregados y coherentes con las migraciones | Alta | 3 | S2 | Por hacer |
| H38 | `CAP-39` | Como equipo, quiero el diagrama de arquitectura y los requisitos no funcionales | Ambos documentos entregados | Alta | 5 | S2 | Por hacer |
| H39 | `CAP-36` | Como equipo, quiero pruebas automatizadas de los flujos críticos | Vitest y Playwright ejecutan los casos automatizables | Alta | 8 | S6 | Por hacer |
| H40 | `CAP-37` | Como equipo, quiero ejecutar las pruebas integrales del flujo completo | Reporte con resultados y evidencia | Alta | 8 | S6 | Por hacer |
| H41 | `CAP-38` | Como equipo, quiero el sistema desplegado para la entrega final | El sistema corre en un entorno accesible | Alta | 5 | S6 | Por hacer |

**Total:** 41 historias y 205 puntos, repartidas en 6 sprints (ver tabla de la sección 4). Estados por marcar por el equipo.

## 8. Estado en Jira (al 25 sep 2026)

- Sprint 1 (`CAP-8, 9, 10, 11, 22–30`): completado, historias en Done.
- Sprint 2 (`CAP-16, 34, 35, 39, 40–48`): activo, 13 historias en To Do.
- Sprints 3 a 6: creados con fechas, sin iniciar.
- Pendiente: exportar la vista Timeline como respaldo de Carta Gantt, y asignar responsable a cada historia del sprint activo.
