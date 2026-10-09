# Plan de Pruebas — TRAZZA (panel web de administración)

> Estado: **Bloque 1 — Definición** (secciones 1 a 5). Pendiente: casos de prueba (6), criterios (7) y evidencia (8).

## 1. Objetivo

Validar que el panel web de administración de TRAZZA cumple sus requisitos funcionales y de seguridad, y que la operación de un servicio del día (agendado → en curso → completado/cancelado) queda registrada de forma correcta y auditable.

## 2. Alcance

| Componente | Estado | En este plan |
|---|---|---|
| Panel web (Next.js + Supabase) | Implementado | **Sí** |
| Base de datos (PostgreSQL, 24 migraciones) | Implementada | **Sí** (reglas, integridad y aislamiento por empresa) |
| Integración Google Maps | Implementada | Sí (mapa y autocompletado de direcciones) |
| App móvil del conductor (Expo) | En desarrollo | No; se incorporará al plan cuando exista |
| Vista del pasajero (RUT + código) | En desarrollo | No; ídem |

**Fuera de alcance:** pruebas de carga masiva, pruebas de penetración y compatibilidad con navegadores distintos a Chrome y Edge actuales.

## 3. Funcionalidades a probar

| ID | Módulo | Funcionalidad | Prioridad |
|---|---|---|---|
| F1 | Acceso | Login, cierre de sesión, redirección sin sesión (`proxy.ts`), exigencia de rol `admin` | Alta |
| F2 | Dashboard | KPIs (flota activa, cumplimiento, alertas críticas, combustible del día), mapa, alertas operacionales, rutas de hoy | Alta |
| F3 | Flota | Alta y detalle de vehículo, carga de combustible e historial, órdenes de mantención | Alta |
| F4 | Conductores | Alta y detalle, alerta de licencia por vencer (30 días), historial de servicios | Media |
| F5 | Rutas y contratos | Alta de contrato y ruta, pasajeros asociados al contrato, edición de horario | Alta |
| F6 | Ciclo del servicio | Iniciar, finalizar y cancelar servicio, bitácora de eventos, gestión de pasajeros, reporte de incidente | Alta |
| F7 | Configuración | Datos de la empresa | Baja |
| F8 | Datos y seguridad | Borrado lógico, aislamiento por empresa (RLS), integridad de claves foráneas | Alta |

## 4. Tipos de prueba y estrategia

| Tipo | Qué valida | Aplica a | Ejecución |
|---|---|---|---|
| Unitarias | Funciones y reglas aisladas (por ejemplo, fecha de Chile en `lib/date.ts`, cálculo de alertas) | F2, F4 | Automatizada |
| Integración | Panel ↔ Supabase: lecturas, escrituras, RLS, restricciones de la base | F3–F6, F8 | Automatizada y manual |
| End to End (E2E) | Flujo completo desde el navegador, por ejemplo login → crear servicio → iniciarlo → finalizarlo | F1, F6 | Automatizada |
| Aceptación | El administrador confirma que el flujo resuelve su necesidad (caso simulado) | F1–F7 | Manual, con criterios de aceptación de cada historia |
| Seguridad (funcional) | Acceso sin sesión, sin rol admin y entre empresas distintas | F1, F8 | Manual y automatizada |

**Estrategia.**
- Las pruebas se ligan a las historias de usuario del Product Backlog en Jira, y cada caso indica su historia.
- Se prueba por sprint. Primero los flujos de prioridad alta, luego los de media y baja.
- Se usa un **caso simulado** único como hilo conductor: una empresa de transporte con 2 vehículos, 2 conductores, 1 contrato con 1 ruta y pasajeros, y un servicio del día que pasa por todos sus estados.
- Un defecto se registra en Jira con evidencia, y se vuelve a probar tras la corrección (prueba de regresión).

## 5. Herramientas y entorno

| Uso | Herramienta |
|---|---|
| Pruebas unitarias | Vitest + React Testing Library |
| Pruebas E2E | Playwright |
| Gestión de casos y defectos | Jira |
| Base de datos de pruebas | Proyecto Supabase aparte del de producción, creado con `npm run db:migrate` |
| Evidencia | Capturas de pantalla y reporte de ejecución de Playwright/Vitest |
| Control de versiones | GitHub |

**Entorno de pruebas.** Un proyecto Supabase distinto del real, para no ensuciar datos. Requiere sus propias variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`) y una clave de Google Maps. Se le cargan los datos del caso simulado antes de cada ciclo de pruebas.

**Responsables.**
- Documentación del plan y de los casos: José Villegas.
- Implementación de las pruebas automatizadas: Juan Marchant y Franz Figueroa.

<!-- Bloque 2 (jueves): 6. Casos de prueba -->
<!-- Bloque 3 (sábado): 7. Criterios de aceptación y 8. Evidencia de ejecución -->
