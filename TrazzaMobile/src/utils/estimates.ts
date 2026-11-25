import type { Coordinates } from "./geo";

// Geometría para el GPS simulado del modo demostración.

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia en línea recta entre dos puntos (haversine), en km. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Rumbo (0-360°) de `a` hacia `b`. */
export function bearing(a: Coordinates, b: Coordinates): number {
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface SimulatedFix extends Coordinates {
  heading: number;
}

/**
 * Posición a una fracción (0-1) del recorrido por los puntos dados, avanzando
 * proporcional a la distancia de cada tramo. Para el modo demostración.
 */
export function positionAlongPath(path: Coordinates[], fraction: number): SimulatedFix | null {
  if (path.length === 0) return null;
  if (path.length === 1) return { ...path[0], heading: 0 };
  const f = Math.min(Math.max(fraction, 0), 1);
  const legs = path.slice(1).map((point, i) => haversineKm(path[i], point));
  const total = legs.reduce((sum, d) => sum + d, 0);
  if (total === 0) return { ...path[0], heading: 0 };

  let target = total * f;
  for (let i = 0; i < legs.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (target <= legs[i] || i === legs.length - 1) {
      const t = legs[i] === 0 ? 1 : Math.min(target / legs[i], 1);
      return {
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
        heading: bearing(a, b),
      };
    }
    target -= legs[i];
  }
  return { ...path[path.length - 1], heading: 0 };
}

/** Longitud total del recorrido, en km. */
export function pathLengthKm(path: Coordinates[]): number {
  return path.slice(1).reduce((sum, point, i) => sum + haversineKm(path[i], point), 0);
}
