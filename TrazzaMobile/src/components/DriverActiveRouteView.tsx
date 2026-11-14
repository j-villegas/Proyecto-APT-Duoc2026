import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "../lib/maps";
import * as Location from "expo-location";
import { Button } from "./Button";
import { useAuth } from "../context/AuthContext";
import { useDriverLocationBroadcast } from "../hooks/useDriverLocationBroadcast";
import { useServiceLive } from "../hooks/useServiceLive";
import { updateServiceStatus, updateStopStatus } from "../services/services";
import { colors, radius, spacing, typography } from "../constants/theme";
import { darkMapStyle } from "../constants/mapStyle";
import { mapProvider, supportsCustomMapStyle } from "../constants/mapProvider";
import { formatTime } from "../utils/format";
import { isClosed } from "../utils/serviceStatus";
import { friendlyError } from "../lib/errors";

interface Props {
  serviceId: string;
  onReportIncident: (serviceId: string) => void;
  /** Salida al terminar la ruta (p. ej. volver a las pestañas). */
  onExit?: () => void;
}

export function DriverActiveRouteView({ serviceId, onReportIncident, onExit }: Props) {
  const { profile } = useAuth();
  // En vivo: si el panel finaliza o cancela la ruta, el conductor lo ve y el GPS se apaga.
  const { service, stops, reload } = useServiceLive(serviceId);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const current = await Location.getCurrentPositionAsync({});
        setMyLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      }
    })();
  }, []);

  const { error: gpsError } = useDriverLocationBroadcast({
    serviceId,
    enabled: !!profile && service?.status === "en_ruta",
  });

  const nextStop = stops.find((s) => s.status !== "completada");
  const closed = !!service && isClosed(service.status);

  const finishService = async () => {
    if (!service) return;
    await updateServiceStatus(service.id, "finalizado");
    await reload();
  };

  const handleArrive = async () => {
    if (!nextStop || busy) return;
    setBusy(true);
    try {
      await updateStopStatus(nextStop.id, "completada");
      const remaining = stops.filter((s) => s.id !== nextStop.id && s.status !== "completada");
      if (remaining.length === 0) await finishService();
      else await reload();
    } catch (err) {
      Alert.alert("No se pudo registrar la parada", friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await finishService();
    } catch (err) {
      Alert.alert("No se pudo finalizar la ruta", friendlyError(err));
    } finally {
      setBusy(false);
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

        {nextStop && !closed ? (
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
        {gpsError && !closed ? (
          <View style={styles.gpsBanner} accessibilityRole="alert">
            <Ionicons name="location-outline" size={16} color={colors.warning} />
            <Text style={styles.gpsBannerText}>{gpsError}</Text>
          </View>
        ) : null}
        {closed ? (
          <View style={styles.closedCard}>
            <Ionicons
              name={service?.status === "cancelado" ? "close-circle" : "checkmark-done-circle"}
              size={28}
              color={service?.status === "cancelado" ? colors.danger : colors.brand}
            />
            <Text style={styles.closedTitle}>
              {service?.status === "cancelado" ? "Ruta cancelada" : "Ruta finalizada"}
            </Text>
            <Text style={styles.closedText}>
              Puedes revisar el registro con las horas en la pestaña Rutas.
            </Text>
            {onExit ? <Button label="Volver al inicio" onPress={onExit} style={styles.closedButton} /> : null}
          </View>
        ) : (
          <>
            <View style={styles.actionRow}>
              {nextStop ? (
                <Button label="Llegué a la parada" onPress={handleArrive} loading={busy} style={styles.flexButton} />
              ) : (
                <Button label="Finalizar ruta" onPress={handleFinish} loading={busy} style={styles.flexButton} />
              )}
            </View>
            <TouchableOpacity style={styles.reportRow} onPress={() => onReportIncident(serviceId)}>
              <Ionicons name="warning-outline" size={16} color={colors.warning} />
              <Text style={styles.reportText}>Reportar problema</Text>
            </TouchableOpacity>
          </>
        )}

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
  gpsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningMuted,
  },
  gpsBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
  closedCard: {
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closedTitle: { ...typography.h3, color: colors.text },
  closedText: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  closedButton: { alignSelf: "stretch", marginTop: spacing.sm },
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
