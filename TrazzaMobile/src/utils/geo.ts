import { Platform } from "react-native";
import * as Location from "expo-location";
import { geocodeWeb } from "../lib/googleMapsWeb";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface MapPoint {
  label: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
}

const geocodeCache = new Map<string, Coordinates | null>();

function hasCoordinates(point: MapPoint): point is MapPoint & Coordinates {
  return typeof point.latitude === "number" && typeof point.longitude === "number";
}

/** Busca las coordenadas de una dirección con el geocodificador del teléfono. */
async function geocodeAddress(address: string): Promise<Coordinates | null> {
  const key = address.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  // En Android el geocodificador exige permiso de ubicación.
  if (Platform.OS === "android") {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
  }

  try {
    let coords: Coordinates | null;
    if (Platform.OS === "web") {
      // expo-location no geocodifica en web: se usa el Geocoder de Google Maps JS.
      coords = await geocodeWeb(`${address}, Chile`);
    } else {
      const [result] = await Location.geocodeAsync(`${address}, Chile`);
      coords = result ? { latitude: result.latitude, longitude: result.longitude } : null;
    }
    geocodeCache.set(key, coords);
    return coords;
  } catch (err) {
    console.warn("[geo] no se pudo geocodificar", address, err);
    return null;
  }
}

/** Devuelve las coordenadas guardadas del punto o, si faltan, las obtiene de la dirección. */
export async function resolvePoint(point: MapPoint): Promise<Coordinates | null> {
  if (hasCoordinates(point)) return { latitude: point.latitude, longitude: point.longitude };
  if (!point.address) return null;
  return geocodeAddress(point.address);
}

/** Alto del área visible (grados de latitud) para leer las calles: ~1 km. */
export const STREET_LEVEL_DELTA = 0.009;

/**
 * Región a nivel de calle centrada en `point`, con el punto en la parte alta
 * del mapa (la parte baja suele quedar bajo una tarjeta superpuesta).
 */
export function streetRegionAround(point: Coordinates, delta = STREET_LEVEL_DELTA) {
  return {
    // Hemisferio sur o norte da igual: correr el centro hacia latitudes
    // menores deja el punto sobre el centro de la pantalla.
    latitude: point.latitude - delta * 0.22,
    longitude: point.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

/**
 * Región del mapa que contiene todos los puntos con un margen alrededor
 * (`padding` = cuántas veces el tamaño del recuadro de los puntos).
 */
export function regionForPoints(points: Coordinates[], padding = 1.6) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * padding, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * padding, 0.01),
  };
}

/**
 * Encuadre a nivel de calle con el conductor y el punto al que va (su
 * recogida o su destino) a la vez, en la parte superior del mapa (abajo
 * quedan las tarjetas). Sin punto de destino, sigue solo al conductor.
 */
export function regionFollowing(driver: Coordinates, target: Coordinates | null, minDelta = STREET_LEVEL_DELTA) {
  if (!target) return streetRegionAround(driver, minDelta);
  const span = Math.max(Math.abs(driver.latitude - target.latitude), Math.abs(driver.longitude - target.longitude));
  const delta = Math.max(span * 1.5, minDelta);
  const latitudeDelta = delta * 1.45;
  return {
    latitude: (driver.latitude + target.latitude) / 2 - latitudeDelta * 0.2,
    longitude: (driver.longitude + target.longitude) / 2,
    latitudeDelta,
    longitudeDelta: delta,
  };
}

/** URL de Google Maps (abre la app o el navegador) para una dirección o coordenada. */
export function externalMapsUrl(point: MapPoint) {
  const query = hasCoordinates(point) ? `${point.latitude},${point.longitude}` : point.address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Solo para tests. */
export function clearGeocodeCache() {
  geocodeCache.clear();
}
