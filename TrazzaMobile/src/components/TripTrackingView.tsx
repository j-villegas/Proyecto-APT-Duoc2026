import React, { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "../lib/maps";
import { StatusStepper, type Step } from "./StatusStepper";
import { Button } from "./Button";
import { getServiceDriver } from "../services/services";
import { useDriverLocationSubscription } from "../hooks/useDriverLocationSubscription";
import { useServiceLive } from "../hooks/useServiceLive";
import type { DriverInfo } from "../types/database";
import { colors, radius, spacing, typography } from "../constants/theme";
import { darkMapStyle } from "../constants/mapStyle";
import { mapProvider, supportsCustomMapStyle } from "../constants/mapProvider";
import { formatTime } from "../utils/format";
import { buildTripSteps } from "../utils/serviceStatus";

interface TripTrackingViewProps {
  serviceId: string;
  onReportIncident: (serviceId: string) => void;
}

export function TripTrackingView({ serviceId, onReportIncident }: TripTrackingViewProps) {
  const { service, stops } = useServiceLive(serviceId);
  const [driver, setDriver] = useState<DriverInfo | null>(null);

  useEffect(() => {
    getServiceDriver(serviceId)
      .then(setDriver)
      .catch(() => setDriver(null));
  }, [serviceId]);

  const driverLocation = useDriverLocationSubscription(service ? serviceId : null);

  // Solo hechos registrados: inicio, paradas y término con su hora real.
  const steps: Step[] = service
    ? buildTripSteps(service, stops).map((step) => ({
        ...step,
        time: step.time ? formatTime(step.time) : undefined,
      }))
    : [];

  const region = driverLocation
    ? {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : {
        latitude: -33.4489,
        longitude: -70.6693,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  return (
    <View style={styles.flex}>
      <View style={styles.mapWrapper}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={mapProvider}
          customMapStyle={supportsCustomMapStyle ? darkMapStyle : undefined}
          initialRegion={region}
          region={driverLocation ? region : undefined}
        >
          {driverLocation ? (
            <Marker
              coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }}
              title={driver?.full_name ?? "Conductor"}
            >
              <View style={styles.driverMarker}>
                <Ionicons name="bus" size={16} color={colors.background} />
              </View>
            </Marker>
          ) : null}
        </MapView>

        <View style={styles.etaCard}>
          <View>
            <Text style={styles.etaTime}>{formatTime(service?.eta)}</Text>
            <Text style={styles.etaLabel}>Llegada estimada</Text>
          </View>
          {driver ? (
            <View style={styles.driverInfo}>
              <View style={styles.avatarSmall}>
                <Ionicons name="person" size={16} color={colors.textMuted} />
              </View>
              <View>
                <Text style={styles.driverName}>{driver.full_name}</Text>
                <Text style={styles.driverSub}>Conductor</Text>
              </View>
              {driver.phone ? (
                <TouchableOpacity
                  hitSlop={10}
                  style={styles.callIcon}
                  onPress={() => Linking.openURL(`tel:${driver.phone}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Llamar a ${driver.full_name}`}
                >
                  <Ionicons name="call" size={18} color={colors.brand} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>Estado del Viaje</Text>
        <StatusStepper steps={steps} />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Reportar problema"
          variant="secondary"
          onPress={() => onReportIncident(serviceId)}
          icon={<Ionicons name="warning-outline" size={16} color={colors.text} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  etaCard: {
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
  etaTime: { ...typography.h3, color: colors.text },
  etaLabel: { ...typography.caption, color: colors.textMuted },
  driverInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  driverName: { ...typography.captionStrong, color: colors.text },
  driverSub: { ...typography.caption, color: colors.textMuted },
  callIcon: { marginLeft: "auto" },
  sheet: { flex: 1 },
  sheetContent: { padding: spacing.lg },
  sheetTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
