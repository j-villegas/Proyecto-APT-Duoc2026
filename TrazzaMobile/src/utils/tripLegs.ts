import type { Service, ServiceStop } from "../types/database";

// Recorrido de un viaje asignado por la central (transporte de personal):
//   origen (base del conductor) → recogidas → destino (bajan todos)
//   → regreso a la base. Bajadas propias ('dropoff') solo si la central las define.
// El pasajero solo ve sus dos tramos: dónde lo recogen y dónde baja.

export interface PassengerStopIds {
  pickupStopId: string | null;
  /** null = baja en el destino final de la ruta. */
  dropoffStopId: string | null;
}

export interface PassengerLegs {
  origin: ServiceStop | null;
  pickup: ServiceStop | null;
  dropoff: ServiceStop | null;
}

const byOrder = (stops: ServiceStop[]) => [...stops].sort((a, b) => a.order_index - b.order_index);

export function passengerLegs(stops: ServiceStop[], ids: PassengerStopIds | null): PassengerLegs {
  const sorted = byOrder(stops);
  return {
    origin: sorted.find((s) => s.type === "origin") ?? null,
    pickup: (ids?.pickupStopId && sorted.find((s) => s.id === ids.pickupStopId)) || null,
    dropoff:
      (ids?.dropoffStopId && sorted.find((s) => s.id === ids.dropoffStopId)) ||
      sorted.find((s) => s.type === "destination") ||
      null,
  };
}

export type PassengerPhase = "scheduled" | "coming" | "onboard" | "arrived" | "cancelled";

const isDone = (stop: ServiceStop | null) => !!stop && (stop.status === "completada" || !!stop.completed_at);

/** En qué parte del viaje está el pasajero. */
export function passengerPhase(service: Service, legs: PassengerLegs): PassengerPhase {
  if (service.status === "cancelado") return "cancelled";
  if (service.status === "finalizado" || isDone(legs.dropoff)) return "arrived";
  if (service.status === "programado") return "scheduled";
  return isDone(legs.pickup) ? "onboard" : "coming";
}

/** Paradas que el conductor hará antes de llegar a `target` (sin contar el origen). */
export function stopsBefore(stops: ServiceStop[], target: ServiceStop | null) {
  if (!target) return 0;
  return byOrder(stops).filter(
    (s) => s.type !== "origin" && s.type !== "return" && s.order_index < target.order_index && s.status !== "completada"
  ).length;
}

export const PHASE_TEXT: Record<PassengerPhase, string> = {
  scheduled: "Tu conductor aún no sale",
  coming: "El conductor va a buscarte",
  onboard: "A bordo · camino a tu destino",
  arrived: "Llegaste a tu destino",
  cancelled: "Viaje cancelado",
};

/** Texto de la parada para el conductor (qué hace en ella). */
export function stopActionLabel(stop: ServiceStop) {
  switch (stop.type) {
    case "origin":
      return "Salida";
    case "pickup":
      return `Recoger a ${stop.label}`;
    case "dropoff":
      return `Dejar a ${stop.label}`;
    case "return":
      return `Regreso a la base · ${stop.label}`;
    default:
      return `Destino · ${stop.label}`;
  }
}

export const STOP_TYPE_SHORT: Record<ServiceStop["type"], string> = {
  origin: "Salida",
  pickup: "Recogida",
  dropoff: "Bajada",
  destination: "Destino de los pasajeros",
  return: "Regreso a la base",
};

/** Botón del conductor al llegar a la parada. */
export function stopArriveButton(stop: ServiceStop) {
  switch (stop.type) {
    case "pickup":
      return "Pasajero a bordo";
    case "dropoff":
      return "Pasajero dejado";
    case "destination":
      return "Llegué al destino";
    case "return":
      return "Llegué a la base";
    default:
      return "Salir del origen";
  }
}
