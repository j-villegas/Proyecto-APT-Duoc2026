// Recorrido por calles de un viaje (Google Directions, en el navegador del
// panel). Se guarda en services.planned_path (migración 033): la app lo dibuja
// y la auditoría lo usa como distancia/duración estimadas.

export type LatLng = { lat: number; lng: number }

export type PlannedRoute = {
  /** [[lat, lng], ...] con 5 decimales (~1 m). */
  path: [number, number][]
  distanceKm: number
  durationMinutes: number
}

/** Directions admite origen, destino y hasta 25 paradas intermedias. */
const MAX_WAYPOINTS = 25

/**
 * Recorrido que pasa por `points` en orden. null si falta Google Maps, hay
 * pocos/demasiados puntos o Directions no responde: el viaje se crea igual.
 */
export async function planRoute(points: LatLng[]): Promise<PlannedRoute | null> {
  const maps = typeof window !== 'undefined' ? window.google?.maps : undefined
  if (!maps?.DirectionsService || points.length < 2 || points.length - 2 > MAX_WAYPOINTS) return null
  try {
    const result = await new maps.DirectionsService().route({
      origin: points[0],
      destination: points[points.length - 1],
      waypoints: points.slice(1, -1).map(location => ({ location, stopover: true })),
      travelMode: maps.TravelMode.DRIVING,
      optimizeWaypoints: false,
    })
    const route = result.routes[0]
    if (!route?.overview_path?.length) return null
    const legs = route.legs ?? []
    return {
      path: route.overview_path.map(p => [round5(p.lat()), round5(p.lng())] as [number, number]),
      distanceKm: legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0) / 1000,
      durationMinutes: legs.reduce((s, l) => s + (l.duration?.value ?? 0), 0) / 60,
    }
  } catch {
    return null
  }
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5
