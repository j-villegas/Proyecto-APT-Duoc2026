import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { StatusStepper, type Step } from "./StatusStepper";
import { Button } from "./Button";
import { getServiceById } from "../services/services";
import { useDriverLocationSubscription } from "../hooks/useDriverLocationSubscription";
import { supabase } from "../lib/supabase";
import type { Profile, Service } from "../types/database";
import { colors, radius, spacing, typography } from "../constants/theme";
import { darkMapStyle } from "../constants/mapStyle";
import { mapProvider, supportsCustomMapStyle } from "../constants/mapProvider";
import { formatTime } from "../utils/format";

const STATUS_ORDER: Service["status"][] = [
  "programado",
  "en_espera",
  "en_camino",
  "en_ruta",
  "finalizado",
];

interface TripTrackingViewProps {
  serviceId: string;
  onReportIncident: (serviceId: string) => void;
}

export function TripTrackingView({ serviceId, onReportIncident }: TripTrackingViewProps) {
  const [service, setService] = useState<Service | null>(null);
  const [driver, setDriver] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const svc = await getServiceById(serviceId);
        setService(svc);
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", svc.driver_id)
          .maybeSingle();
        setDriver(data as Profile | null);
      } catch (err) {
        console.warn("No se pudo cargar el viaje:", err);
      }
    })();
  }, [serviceId]);

  const driverLocation = useDriverLocationSubscription(service?.driver_id ?? null);
  const currentIndex = service ? STATUS_ORDER.indexOf(service.status) : 0;

  const steps: Step[] = [
    { label: "Servicio programado", time: service ? formatTime(service.scheduled_at) : undefined },
    { label: "Vehículo asignado" },
    { label: "Conductor en camino", time: "Aproximadamente 7 min." },
    { label: "Llegada al punto" },
    { label: "Pasajero abordo" },
    { label: "En ruta" },
    { label: "Finalizado" },
  ].map((step, index) => ({
    ...step,
    state: index < currentIndex + 1 ? "done" : index === currentIndex + 1 ? "active" : "pending",
  })) as Step[];

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
              <TouchableOpacity hitSlop={10} style={styles.callIcon}>
                <Ionicons name="call" size={18} color={colors.brand} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>Estado del Viaje</Text>
        <StatusStepper steps={steps} />
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Estoy listo en el punto" onPress={() => {}} />
        <Button
          label="Reportar problema"
          variant="secondary"
          onPress={() => onReportIncident(serviceId)}
          style={styles.reportButton}
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
  reportButton: { marginTop: spacing.sm },
});
