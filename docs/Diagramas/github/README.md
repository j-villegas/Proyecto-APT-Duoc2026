# TRAZZA: procesos de negocio

Plataforma de seguimiento en tiempo real para el transporte de personal.
Proyecto de título de Ingeniería en Informática (Capstone).

Este repositorio reúne los diagramas de procesos de negocio de TRAZZA, dibujados con notación BPMN 2.0.
Haz clic en una imagen para verla en tamaño completo.

**Cómo leerlos**

| Color | Significado |
|---|---|
| Ámbar | Actual: existe evidencia en el código o en la base de datos |
| Rosado | Proyectado: capacidad o regla futura |
| Gris | Externo: actividad del cliente o de un tercero |

Línea continua: secuencia dentro de un participante. Línea punteada: mensaje entre participantes.

---

## 1. Mapa de procesos del negocio

La pyme transforma una necesidad de transporte en un servicio trazable. El cliente contrata, el administrador planifica, el conductor ejecuta y el pasajero consulta. Cada cuadro con el signo + es un proceso que se detalla en los diagramas siguientes.

![Mapa de procesos del negocio](img/01-mapa-de-procesos.svg)

## 2. BPMN 01: Contratación y pasajeros

El cliente comunica la necesidad y confirma las condiciones. El administrador valida los antecedentes, registra el contrato y su nómina de pasajeros. La aprobación comercial ocurre fuera del panel actual.

![BPMN 01: Contratación y pasajeros](img/02-bpmn-contratacion.svg)

## 3. BPMN 02: Planificar y ejecutar el servicio

Se prepara un recorrido y un viaje concreto. El inicio y el cierre actuales se hacen desde el panel. La app del conductor y el acceso del pasajero son proyectados, y la consulta del pasajero puede repetirse mientras el viaje está activo.

![BPMN 02: Planificar y ejecutar el servicio](img/03-bpmn-planificar-ejecutar.svg)

## 4. BPMN 03: Reportar y resolver incidentes

El conductor comunica un incidente y el administrador evalúa su impacto y las medidas. TRAZZA conserva la severidad, el estado y la resolución. Estados del incidente: abierto, en revisión y resuelto.

![BPMN 03: Reportar y resolver incidentes](img/04-bpmn-incidentes.svg)

## 5. BPMN 04: Mantenimiento y combustible

Dos procedimientos independientes sostienen la flota. Mantenimiento: orden, intervención externa y cierre. Combustible: carga externa y registro operacional. La habilitación final requiere la revisión del responsable.

![BPMN 04: Mantenimiento y combustible](img/05-bpmn-flota-combustible.svg)

---

## Archivos editables

Los diagramas también están en formato `.bpmn`, que se abre y se edita en [bpmn.io](https://demo.bpmn.io) o en Camunda Modeler.

- [Mapa de procesos](bpmn/01-mapa-de-procesos.bpmn)
- [BPMN 01: Contratación y pasajeros](bpmn/02-bpmn-contratacion.bpmn)
- [BPMN 02: Planificar y ejecutar el servicio](bpmn/03-bpmn-planificar-ejecutar.bpmn)
- [BPMN 03: Reportar y resolver incidentes](bpmn/04-bpmn-incidentes.bpmn)
- [BPMN 04: Mantenimiento y combustible](bpmn/05-bpmn-flota-combustible.bpmn)

## Equipo

José Villegas, Juan Marchant y Franz Figueroa.
