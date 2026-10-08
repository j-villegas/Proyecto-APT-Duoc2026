import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { Button } from "./Button";
import { useAuth } from "../context/AuthContext";
import { useDriverLocationBroadcast } from "../hooks/useDriverLocationBroadcast";
import {
  getServiceById,
  getServiceStops,
  updateServiceStatus,
  updateStopStatus,
} from "../services/services";
import type { Service, ServiceStop } from "../types/database";
import { colors, radius, spacing, typography } from "../constants/theme";
import { darkMapStyle } from "../constants/mapStyle";
import { mapProvider, supportsCustomMapStyle } from "../constants/mapProvider";
import { formatTime } from "../utils/format";

interface Props {
  serviceId: string;
  onReportIncident: (serviceId: string) => void;
}

export function DriverActiveRouteView({ serviceId, onReportIncident }: Props) {
  const { profile } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [stops, setStops] = useState<ServiceStop[]>([]);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const svc = await getServiceById(serviceId);
        setService(svc);
        const stopList = await getServiceStops(serviceId);
        setStops(stopList);
      } catch (err) {
        console.warn("No se pudo cargar la ruta activa:", err);
      }
    })();
  }, [serviceId]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const current = await Location.getCurrentPositionAsync({});
        setMyLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      }
    })();
  }, []);

  useDriverLocationBroadcast({
    driverId: profile?.id ?? "",
    serviceId,
    enabled: !!profile,
  });

  const nextStop = stops.find((s) => s.status !== "completada");

  const handleArrive = async () => {
    if (nextStop) {
      await updateStopStatus(nextStop.id, "completada");
      setStops((prev) =>
        prev.map((s) => (s.id === nextStop.id ? { ...s, status: "completada" } : s))
      );
    }
    const remaining = stops.filter((s) => s.id !== nextStop?.id && s.status !== "completada");
    if (remaining.length === 0 && service) {
      await updateServiceStatus(service.id, "finalizado");
    }
  };

  const region = myLocation
    ? { ...myLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: -33.4489, longitude: -70.6693, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  return (
    <View style={styles.flex}>
      <View style={styles.mapWrapper}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={mapProvider}
          customMapStyle={supportsCustomMapStyle ? darkMapStyle : undefined}
          initialRegion={region}
          showsUserLocation
        >
          {myLocation ? (
            <Marker coordinate={myLocation}>
              <View style={styles.driverMarker}>
                <Ionicons name="navigate" size={14} color={colors.background} />
              </View>
            </Marker>
          ) : null}
        </MapView>

        {nextStop ? (
          <View style={styles.stopCard}>
            <Text style={styles.stopLabel}>Próxima parada</Text>
            <Text style={styles.stopName}>{nextStop.label}</Text>
            <Text style={styles.stopMeta}>
              {formatTime(nextStop.eta)} · {nextStop.passenger_count} pasajeros
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <View style={styles.actionRow}>
          <Button label="Llegué a la parada" onPress={handleArrive} style={styles.flexButton} />
        </View>
        <TouchableOpacity style={styles.reportRow} onPress={() => onReportIncident(serviceId)}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={styles.reportText}>Reportar problema</Text>
        </TouchableOpacity>

        <Text style={styles.sheetTitle}>Itinerario de Ruta</Text>
        {stops.map((stop) => (
          <View key={stop.id} style={styles.itineraryRow}>
            <Ionicons
              name={stop.status === "completada" ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={stop.status === "completada" ? colors.brand : colors.textFaint}
            />
            <View style={styles.flex1}>
              <Text style={styles.itineraryLabel}>{stop.label}</Text>
              <Text style={styles.itineraryMeta}>
                {formatTime(stop.eta)} · {stop.passenger_count} pas.
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexButton: { flex: 1 },
  mapWrapper: { height: 260, backgroundColor: colors.surface },
  driverMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white,
  },
  stopCard: {
    position: "absolute",
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stopLabel: { ...typography.label, color: colors.textFaint },
  stopName: { ...typography.h3, color: colors.text, marginTop: 2 },
  stopMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  sheet: { flex: 1 },
  sheetContent: { padding: spacing.lg },
  actionRow: { flexDirection: "row", gap: spacing.md },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  reportText: { ...typography.bodyStrong, color: colors.warning },
  sheetTitle: { ...typography.h3, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.md },
  itineraryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  flex1: { flex: 1 },
  itineraryLabel: { ...typography.bodyStrong, color: colors.text },
  itineraryMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
