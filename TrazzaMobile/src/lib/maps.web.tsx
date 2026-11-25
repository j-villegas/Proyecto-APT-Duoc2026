import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../constants/theme";
import {
  loadGoogleMaps,
  onMapsAuthFailure,
  type GMap,
  type GMarker,
  type GPolyline,
  type GoogleMapsNamespace,
} from "./googleMapsWeb";

// react-native-maps no tiene implementación web. En el navegador se dibuja el
// mapa con Google Maps JavaScript API (misma key del build nativo) y la misma
// API mínima que usa la app: MapView con initialRegion/region y Marker con
// coordinate/title. Así el pasajero ve avanzar al conductor también en la
// demo desde el navegador. Sin key o si la carga falla, se muestra un aviso.

export const PROVIDER_GOOGLE = "google";

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface MapViewProps {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  region?: Region;
  customMapStyle?: object[];
  children?: React.ReactNode;
  testID?: string;
  // El resto de props de react-native-maps se ignoran en web.
  [key: string]: unknown;
}

interface MarkerProps {
  coordinate: { latitude: number; longitude: number };
  title?: string;
  /** Color del pin (en nativo la app usa una vista propia como marcador). */
  pinColor?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

interface PolylineProps {
  coordinates: { latitude: number; longitude: number }[];
  strokeColor?: string;
  strokeWidth?: number;
  [key: string]: unknown;
}

const MapContext = createContext<{ map: GMap; maps: GoogleMapsNamespace } | null>(null);

/** Zoom aproximado para que entre el delta de latitud pedido. */
function zoomForDelta(delta: number) {
  return Math.max(3, Math.min(18, Math.round(Math.log2(360 / Math.max(delta, 0.0005)))));
}

export function Marker({ coordinate, title, pinColor }: MarkerProps) {
  const ctx = useContext(MapContext);
  const marker = useRef<GMarker | null>(null);

  useEffect(() => {
    if (!ctx) return;
    marker.current = new ctx.maps.Marker({
      map: ctx.map,
      position: { lat: coordinate.latitude, lng: coordinate.longitude },
      title,
      icon: {
        path: ctx.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: pinColor ?? colors.brand,
        fillOpacity: 1,
        strokeColor: colors.white,
        strokeWeight: 2,
      },
    });
    return () => {
      marker.current?.setMap(null);
      marker.current = null;
    };
    // Se crea una vez por mapa; posición y título se actualizan abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  useEffect(() => {
    marker.current?.setPosition({ lat: coordinate.latitude, lng: coordinate.longitude });
  }, [coordinate.latitude, coordinate.longitude]);

  useEffect(() => {
    if (title) marker.current?.setTitle(title);
  }, [title]);

  return null;
}

/** Línea del recorrido (misma API que Polyline de react-native-maps). */
export function Polyline({ coordinates, strokeColor, strokeWidth }: PolylineProps) {
  const ctx = useContext(MapContext);
  const line = useRef<GPolyline | null>(null);
  const toPath = () => coordinates.map((c) => ({ lat: c.latitude, lng: c.longitude }));
  const pathKey = coordinates.map((c) => `${c.latitude},${c.longitude}`).join(";");

  useEffect(() => {
    if (!ctx) return;
    line.current = new ctx.maps.Polyline({
      map: ctx.map,
      path: toPath(),
      strokeColor: strokeColor ?? colors.brand,
      strokeOpacity: 0.85,
      strokeWeight: strokeWidth ?? 4,
      zIndex: 1,
    });
    return () => {
      line.current?.setMap(null);
      line.current = null;
    };
    // Se crea una vez por mapa; el recorrido se actualiza abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  useEffect(() => {
    line.current?.setPath(toPath());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  return null;
}

export default function MapView({ style, initialRegion, region, customMapStyle, children, testID }: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const [ctx, setCtx] = useState<{ map: GMap; maps: GoogleMapsNamespace } | null>(null);
  const [failed, setFailed] = useState(false);
  const start = region ?? initialRegion;

  // Key rechazada en este origen: se muestra el aviso en vez del error de Google.
  useEffect(() => onMapsAuthFailure(() => setFailed(true)), []);

  useEffect(() => {
    let active = true;
    loadGoogleMaps().then((maps) => {
      if (!active) return;
      if (!maps || !container.current) {
        setFailed(true);
        return;
      }
      const map = new maps.Map(container.current, {
        center: start ? { lat: start.latitude, lng: start.longitude } : { lat: -23.6509, lng: -70.3975 },
        zoom: start ? zoomForDelta(start.latitudeDelta) : 12,
        disableDefaultUI: true,
        zoomControl: true,
        styles: customMapStyle,
        backgroundColor: colors.surface,
      });
      setCtx({ map, maps });
    });
    return () => {
      active = false;
    };
    // El mapa se crea una sola vez; los cambios de región se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `region` controlado: el mapa muestra exactamente esa área (como en
  // react-native-maps), ajustada al tamaño real del contenedor.
  useEffect(() => {
    if (!ctx || !region) return;
    const half = { lat: region.latitudeDelta / 2, lng: region.longitudeDelta / 2 };
    const bounds = new ctx.maps.LatLngBounds(
      { lat: region.latitude - half.lat, lng: region.longitude - half.lng },
      { lat: region.latitude + half.lat, lng: region.longitude + half.lng },
    );
    ctx.map.fitBounds(bounds, 0);
  }, [ctx, region?.latitude, region?.longitude, region?.latitudeDelta, region?.longitudeDelta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    return (
      <View style={[style, styles.placeholder]} testID={testID}>
        <Ionicons name="map-outline" size={28} color={colors.textFaint} />
        <Text style={styles.text}>No se pudo cargar el mapa en el navegador</Text>
        <Text style={styles.hint}>
          Autoriza este origen ({typeof window !== "undefined" ? window.location.origin : "web"}) en la API key de
          Google Maps (EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY).
        </Text>
      </View>
    );
  }

  return (
    <View style={style} testID={testID}>
      {React.createElement("div", { ref: container, style: { position: "absolute", inset: 0 } })}
      <MapContext.Provider value={ctx}>{ctx ? children : null}</MapContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  text: { color: colors.textFaint, fontSize: 13, textAlign: "center" },
  hint: { color: colors.textFaint, fontSize: 11, textAlign: "center" },
});
