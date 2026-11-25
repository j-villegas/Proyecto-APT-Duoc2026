import React, { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline } from "../lib/maps";
import { StatusStepper, type Step } from "./StatusStepper";
import { Button } from "./Button";
import { getServiceDriver } from "../services/services";
import { useDriverLocationSubscription } from "../hooks/useDriverLocationSubscription";
import { useServiceLive } from "../hooks/useServiceLive";
import { useServiceStatusNotice } from "../hooks/useServiceStatusNotice";
import { ServiceNoticeBanner } from "./ServiceNoticeBanner";
import type { DriverInfo } from "../types/database";
import { colors, radius, spacing, typography } from "../constants/theme";
import { darkMapStyle } from "../constants/mapStyle";
import { mapProvider, supportsCustomMapStyle } from "../constants/mapProvider";
import { formatTime } from "../utils/format";
import { buildPassengerTripSteps } from "../utils/serviceStatus";
import { PHASE_TEXT, passengerPhase, stopsBefore } from "../utils/tripLegs";
import { usePassengerLegs } from "../hooks/usePassengerLegs";
import { regionFollowing, regionForPoints, type Coordinates } from "../utils/geo";

interface TripTrackingViewProps {
  serviceId: string;
  onReportIncident: (serviceId: string) => void;
}

export function TripTrackingView({ serviceId, onReportIncident }: TripTrackingViewProps) {
  const { service, stops } = useServiceLive(serviceId);
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const { notice, dismiss } = useServiceStatusNotice(service);

  // Se vuelve a pedir si la central cambia el conductor asignado.
  const assignedDriverId = service?.driver_id ?? null;
  useEffect(() => {
    getServiceDriver(serviceId)
      .then(setDriver)
      .catch(() => setDriver(null));
  }, [serviceId, assignedDriverId]);

  const driverLocation = useDriverLocationSubscription(service ? serviceId : null);
  // Tramos del pasajero: dónde lo recogen y dónde baja (no el origen de la ruta,
  // que es la salida del conductor).
  const legs = usePassengerLegs(serviceId, stops);
  const phase = service ? passengerPhase(service, legs) : "scheduled";
  const before = phase === "coming" ? stopsBefore(stops, legs.pickup) : 0;
  const phaseText =
    PHASE_TEXT[phase] + (before > 0 ? ` · ${before} parada${before === 1 ? "" : "s"} antes que tú` : "");

  const pickupPoint =
    typeof legs.pickup?.latitude === "number" && typeof legs.pickup?.longitude === "number"
      ? { latitude: legs.pickup.latitude, longitude: legs.pickup.longitude }
      : null;
  const dropoffPoint =
    typeof legs.dropoff?.latitude === "number" && typeof legs.dropoff?.longitude === "number"
      ? { latitude: legs.dropoff.latitude, longitude: legs.dropoff.longitude }
      : typeof service?.destination_latitude === "number" && typeof service?.destination_longitude === "number"
      ? { latitude: service.destination_latitude, longitude: service.destination_longitude }
      : null;

  // Solo los hitos del pasajero: salida del conductor, su recogida, su bajada y término.
  const steps: Step[] = service
    ? buildPassengerTripSteps(service, legs).map((step) => ({
        ...step,
        time: step.time ? formatTime(step.time) : undefined,
      }))
    : [];

  // Vista general del viaje: su recogida, su destino y el conductor a la vez
  // (con margen bajo la tarjeta de llegada).
  const tripPoints: Coordinates[] = [];
  if (pickupPoint) tripPoints.push(pickupPoint);
  if (dropoffPoint) tripPoints.push(dropoffPoint);
  if (driverLocation) tripPoints.push({ latitude: driverLocation.latitude, longitude: driverLocation.longitude });
  const fitted = tripPoints.length ? regionForPoints(tripPoints, 1.5) : null;
  // Con el conductor en movimiento: a nivel de calle, con él y el punto al que
  // va (la recogida y, ya a bordo, el destino) a la vez. Antes de tener su
  // posición: el viaje completo, agrandado hacia el sur para que quede sobre
  // la tarjeta de llegada.
  const target = phase === "coming" ? pickupPoint : phase === "onboard" ? dropoffPoint : null;
  const region = driverLocation
    ? regionFollowing({ latitude: driverLocation.latitude, longitude: driverLocation.longitude }, target)
    : fitted
    ? {
        ...fitted,
        latitude: fitted.latitude - fitted.latitudeDelta * 0.45,
        latitudeDelta: fitted.latitudeDelta * 1.9,
      }
    : { latitude: -33.4489, longitude: -70.6693, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  return (
    <View style={styles.flex}>
      <View style={styles.mapWrapper}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={mapProvider}
          customMapStyle={supportsCustomMapStyle ? darkMapStyle : undefined}
          initialRegion={region}
          region={tripPoints.length ? region : undefined}
        >
          {service?.planned_path && service.planned_path.length >= 2 ? (
            <Polyline coordinates={service.planned_path} strokeColor={colors.brand} strokeWidth={4} />
          ) : null}
          {pickupPoint ? (
            <Marker coordinate={pickupPoint} title="Tu punto de recogida" pinColor={colors.white}>
              <View style={[styles.pointMarker, { backgroundColor: colors.white }]}>
                <Ionicons name="person" size={11} color={colors.background} />
              </View>
            </Marker>
          ) : null}
          {dropoffPoint ? (
            <Marker coordinate={dropoffPoint} title="Tu destino" pinColor={colors.info}>
              <View style={[styles.pointMarker, { backgroundColor: colors.info }]}>
                <Ionicons name="flag" size={11} color={colors.white} />
              </View>
            </Marker>
          ) : null}
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
          <View style={styles.phaseRow}>
            <Ionicons
              name={phase === "onboard" ? "car" : phase === "arrived" ? "flag" : "navigate"}
              size={14}
              color={colors.brand}
            />
            <Text style={styles.phaseText}>{phaseText}</Text>
          </View>
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
        <ServiceNoticeBanner notice={notice} onDismiss={dismiss} />
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
  // Alto suficiente para que el conductor (centro del mapa) quede sobre la tarjeta de llegada.
  mapWrapper: { height: 380, backgroundColor: colors.surface },
  pointMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
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
  phaseRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  phaseText: { ...typography.captionStrong, color: colors.brand, flex: 1 },
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
