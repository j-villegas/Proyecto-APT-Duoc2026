import type { Service, ServiceStatus, ServiceStop } from "../types/database";

export type DriverAction =
  | { kind: "prepare"; label: string }
  | { kind: "continue"; label: string }
  | { kind: "view"; label: string };

/** Servicios cerrados: ya no admiten acciones, solo consulta. */
export function isClosed(status: ServiceStatus) {
  return status === "finalizado" || status === "cancelado";
}

/** Acción principal que el conductor puede hacer sobre un servicio según su estado. */
export function driverActionFor(status: ServiceStatus): DriverAction {
  if (isClosed(status)) return { kind: "view", label: "Ver detalle" };
  if (status === "programado") return { kind: "prepare", label: "Preparar ruta" };
  return { kind: "continue", label: "Continuar ruta" };
}

export interface TimelineEntry {
  key: string;
  label: string;
  detail?: string;
  at: string | null;
  tone: "neutral" | "done" | "danger";
}

/** Registro de lo ocurrido en el servicio, con la hora real de cada gestión. */
export function buildServiceTimeline(service: Service, stops: ServiceStop[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { key: "scheduled", label: "Programado", at: service.scheduled_at, tone: "neutral" },
  ];

  if (service.actual_start_at) {
    entries.push({ key: "started", label: "Inicio de ruta", at: service.actual_start_at, tone: "done" });
  }

  [...stops]
    .sort((a, b) => a.order_index - b.order_index)
    .forEach((stop) => {
      const at = stop.completed_at ?? stop.arrived_at;
      if (!at) return;
      entries.push({
        key: `stop-${stop.id}`,
        label: stop.completed_at ? "Parada completada" : "Llegada a parada",
        detail: stop.label,
        at,
        tone: "done",
      });
    });

  if (service.status === "finalizado") {
    entries.push({ key: "finished", label: "Servicio finalizado", at: service.actual_end_at, tone: "done" });
  } else if (service.status === "cancelado") {
    entries.push({
      key: "cancelled",
      label: "Servicio cancelado",
      detail: service.cancel_reason ?? undefined,
      at: service.actual_end_at,
      tone: "danger",
    });
  }

  return entries;
}

export interface TripStep {
  key: string;
  label: string;
  time?: string | null;
  state: "done" | "active" | "pending";
}

/**
 * Progreso del viaje para el pasajero, solo con hechos registrados:
 * programado → inicio de ruta → cada parada → término (o cancelación).
 * El primer paso sin completar queda "active".
 */
export function buildTripSteps(service: Service, stops: ServiceStop[]): TripStep[] {
  const cancelled = service.status === "cancelado";
  const facts: { key: string; label: string; time?: string | null; done: boolean }[] = [
    { key: "scheduled", label: "Servicio programado", time: service.scheduled_at, done: true },
    {
      key: "started",
      label: "El conductor inició la ruta",
      time: service.actual_start_at,
      done: !!service.actual_start_at,
    },
  ];

  [...stops]
    .sort((a, b) => a.order_index - b.order_index)
    .forEach((stop) => {
      const at = stop.completed_at ?? stop.arrived_at;
      facts.push({ key: `stop-${stop.id}`, label: stop.label, time: at, done: stop.status === "completada" || !!at });
    });

  facts.push(
    cancelled
      ? { key: "cancelled", label: "Viaje cancelado", time: service.actual_end_at, done: true }
      : { key: "finished", label: "Viaje finalizado", time: service.actual_end_at, done: service.status === "finalizado" }
  );

  // Un viaje cancelado no tiene paso "en curso".
  let activeAssigned = cancelled;
  return facts.map(({ done, ...step }) => {
    if (done) return { ...step, state: "done" };
    if (!activeAssigned) {
      activeAssigned = true;
      return { ...step, state: "active" };
    }
    return { ...step, state: "pending" };
  });
}
