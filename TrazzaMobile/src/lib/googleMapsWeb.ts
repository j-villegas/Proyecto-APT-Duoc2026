// Carga de Google Maps JavaScript API para la versión web de la app (la
// misma key EXPO_PUBLIC_GOOGLE_MAPS_API_KEY que usa el build nativo). Solo se
// usa desde archivos *.web.tsx o detrás de Platform.OS === "web".

/* Tipos mínimos de lo que usa la app (no se instala @types/google.maps). */
export interface GLatLng {
  lat: number;
  lng: number;
}

export interface GMap {
  setCenter(center: GLatLng): void;
  panTo(center: GLatLng): void;
  setZoom(zoom: number): void;
  fitBounds(bounds: unknown, padding?: number): void;
}

export interface GMarker {
  setPosition(position: GLatLng): void;
  setTitle(title: string): void;
  setIcon(icon: unknown): void;
  setMap(map: GMap | null): void;
}

export interface GPolyline {
  setPath(path: GLatLng[]): void;
  setMap(map: GMap | null): void;
}

export interface GoogleMapsNamespace {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => GMap;
  Marker: new (options: Record<string, unknown>) => GMarker;
  Polyline: new (options: Record<string, unknown>) => GPolyline;
  LatLngBounds: new (sw?: GLatLng, ne?: GLatLng) => unknown;
  Geocoder: new () => {
    geocode(
      request: { address: string; region?: string },
      callback: (results: { geometry: { location: { lat(): number; lng(): number } } }[] | null, status: string) => void
    ): void;
  };
  SymbolPath: { CIRCLE: number };
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsNamespace };
    __trazzaMapsReady?: () => void;
    /** Google lo llama si rechaza la key (p. ej. origen no autorizado). */
    gm_authFailure?: () => void;
  }
}

let authFailed = false;
const authListeners = new Set<() => void>();

/** Avisa si Google rechaza la key en este origen (RefererNotAllowedMapError, etc.). */
export function onMapsAuthFailure(listener: () => void) {
  if (authFailed) listener();
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

// Key propia para web (restringida a sitios web: localhost:8081, etc.). Si no
// se define, se usa la del build nativo.
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
let loader: Promise<GoogleMapsNamespace | null> | null = null;

/** Promesa con google.maps, o null si no hay key, no hay navegador o la carga falla. */
export function loadGoogleMaps(): Promise<GoogleMapsNamespace | null> {
  if (typeof window === "undefined" || !API_KEY) return Promise.resolve(null);
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loader) return loader;

  window.gm_authFailure = () => {
    authFailed = true;
    authListeners.forEach((l) => l());
  };
  loader = new Promise((resolve) => {
    window.__trazzaMapsReady = () => resolve(window.google?.maps ?? null);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&callback=__trazzaMapsReady&loading=async&language=es&region=CL`;
    script.async = true;
    script.onerror = () => {
      loader = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return loader;
}

/** Geocodificación en web con el Geocoder de Google (expo-location no la ofrece en web). */
export async function geocodeWeb(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const maps = await loadGoogleMaps();
  if (!maps) return null;
  return new Promise((resolve) => {
    new maps.Geocoder().geocode({ address, region: "cl" }, (results, status) => {
      const location = status === "OK" ? results?.[0]?.geometry.location : null;
      resolve(location ? { latitude: location.lat(), longitude: location.lng() } : null);
    });
  });
}
