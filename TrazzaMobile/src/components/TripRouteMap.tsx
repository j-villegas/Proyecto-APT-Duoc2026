import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import MapView, { Marker } from "../lib/maps";
import { darkMapStyle } from "../constants/mapStyle";
import { mapProvider, supportsCustomMapStyle } from "../constants/mapProvider";
import { colors, radius, spacing, typography } from "../constants/theme";
import {
  externalMapsUrl,
  regionForPoints,
  resolvePoint,
  type Coordinates,
  type MapPoint,
} from "../utils/geo";

interface TripRouteMapProps {
  origin: MapPoint;
  destination: MapPoint;
  height?: number;
}

type State =
  | { status: "loading" }
  | { status: "ready"; origin: Coordinates | null; destination: Coordinates | null }
  | { status: "unavailable" };

/** Mapa estático del punto de recogida y el destino de un viaje. */
export function TripRouteMap({ origin, destination, height = 180 }: TripRouteMapProps) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    Promise.all([resolvePoint(origin), resolvePoint(destination)]).then(([o, d]) => {
      if (!active) return;
      setState(o || d ? { status: "ready", origin: o, destination: d } : { status: "unavailable" });
    });
    return () => {
      active = false;
    };
  }, [
    origin.address,
    origin.latitude,
    origin.longitude,
    destination.address,
    destination.latitude,
    destination.longitude,
  ]);

  const openExternal = () => Linking.openURL(externalMapsUrl(origin));

  if (state.status !== "ready") {
    return (
      <View style={[styles.container, styles.placeholder, { height }]}>
        {state.status === "loading" ? (
          <ActivityIndicator color={colors.brand} accessibilityLabel="Cargando mapa" />
        ) : (
          <>
            <Ionicons name="map-outline" size={24} color={colors.textFaint} />
            <Text style={styles.placeholderText}>No pudimos ubicar la dirección en el mapa.</Text>
            <TouchableOpacity onPress={openExternal} hitSlop={8}>
              <Text style={styles.link}>Abrir en Google Maps</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  const points = [state.origin, state.destination].filter((p): p is Coordinates => !!p);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        testID="trip-route-map"
        style={StyleSheet.absoluteFill}
        provider={mapProvider}
        customMapStyle={supportsCustomMapStyle ? darkMapStyle : undefined}
        initialRegion={regionForPoints(points)}
        liteMode
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {state.origin ? (
          <Marker coordinate={state.origin} title={origin.label} description={origin.address}>
            <View style={[styles.marker, { backgroundColor: colors.brand }]}>
              <Ionicons name="person" size={12} color={colors.background} />
            </View>
          </Marker>
        ) : null}
        {state.destination ? (
          <Marker
            coordinate={state.destination}
            title={destination.label}
            description={destination.address}
          >
            <View style={[styles.marker, { backgroundColor: colors.info }]}>
              <Ionicons name="flag" size={12} color={colors.white} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      <TouchableOpacity
        style={styles.openButton}
        onPress={openExternal}
        accessibilityLabel="Abrir en Google Maps"
      >
        <Ionicons name="open-outline" size={16} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
  },
  placeholderText: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  link: { ...typography.captionStrong, color: colors.brand },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white,
  },
  openButton: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
