import { Platform } from "react-native";
import * as Location from "expo-location";

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
    const [result] = await Location.geocodeAsync(`${address}, Chile`);
    const coords = result ? { latitude: result.latitude, longitude: result.longitude } : null;
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

/** Región del mapa que contiene todos los puntos con un margen alrededor. */
export function regionForPoints(points: Coordinates[]) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.01),
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
