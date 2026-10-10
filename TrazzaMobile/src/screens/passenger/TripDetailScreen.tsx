import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { RoutePoints } from "../../components/RoutePoints";
import { TripRouteMap } from "../../components/TripRouteMap";
import { getServiceById, getServiceDriver, getVehicleById } from "../../services/services";
import type { DriverInfo, Service, Vehicle } from "../../types/database";
import { colors, spacing, typography } from "../../constants/theme";
import { formatTime } from "../../utils/format";
import type { PassengerStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<PassengerStackParamList, "TripDetail">;

export default function TripDetailScreen({ route, navigation }: Props) {
  const { serviceId } = route.params;
  const [service, setService] = useState<Service | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const svc = await getServiceById(serviceId);
        setService(svc);
        const [veh, driverInfo] = await Promise.all([
          svc.vehicle_id ? getVehicleById(svc.vehicle_id) : Promise.resolve(null),
          getServiceDriver(serviceId),
        ]);
        setVehicle(veh);
        setDriver(driverInfo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el viaje.");
      } finally {
        setLoading(false);
      }
    })();
  }, [serviceId]);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Detalle del Viaje" onBack={navigation.goBack} />
        <View style={styles.loading}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || !service) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Detalle del Viaje" onBack={navigation.goBack} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader
        title="Detalle del Viaje"
        subtitle={`CÓDIGO DE SERVICIO ${service.code}`}
        onBack={navigation.goBack}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeRow}>
          <StatusBadge status={service.status} />
        </View>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>RESUMEN DE TIEMPOS</Text>
          <View style={styles.timesRow}>
            <View>
              <Text style={styles.timeLabel}>HORA PROGRAMADA</Text>
              <Text style={styles.timeValue}>{formatTime(service.scheduled_at)}</Text>
            </View>
            <View>
              <Text style={styles.timeLabel}>LLEGADA ESTIMADA</Text>
              <Text style={styles.timeValue}>{formatTime(service.eta)}</Text>
            </View>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>PUNTO DE RECOGIDA</Text>
          <Text style={styles.pointLabel}>{service.origin_label}</Text>
          <Text style={styles.pointAddress}>{service.origin_address}</Text>
          <TripRouteMap
            origin={{
              label: service.origin_label,
              address: service.origin_address,
              latitude: service.origin_latitude,
              longitude: service.origin_longitude,
            }}
            destination={{
              label: service.destination_label,
              address: service.destination_address,
              latitude: service.destination_latitude,
              longitude: service.destination_longitude,
            }}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>ASIGNACIÓN</Text>
          <View style={styles.assignmentRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={20} color={colors.textMuted} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.assignmentName}>{driver?.full_name ?? "Conductor"}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color={colors.warning} />
                <Text style={styles.ratingText}>{driver?.rating ?? "4.9"}</Text>
              </View>
            </View>
            <Ionicons name="call-outline" size={20} color={colors.brand} />
          </View>
          <View style={styles.divider} />
          <View style={styles.assignmentRow}>
            <View style={styles.avatar}>
              <Ionicons name="bus" size={20} color={colors.textMuted} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.assignmentName}>
                {vehicle ? `${vehicle.brand} ${vehicle.model}` : "Vehículo"}
              </Text>
              <Text style={styles.plateText}>{vehicle?.plate}</Text>
            </View>
          </View>
        </Card>

        <RoutePoints
          originLabel={service.origin_label}
          originAddress={service.origin_address}
          destinationLabel={service.destination_label}
          destinationAddress={service.destination_address}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Estoy listo en el punto"
          onPress={() => navigation.navigate("TripTracking", { serviceId: service.id })}
        />
        <Button
          label="Reportar problema"
          variant="secondary"
          onPress={() => navigation.navigate("ReportIncident", { serviceId: service.id })}
          style={styles.reportButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  errorText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  badgeRow: { flexDirection: "row" },
  card: { gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.textFaint },
  timesRow: { flexDirection: "row", justifyContent: "space-between" },
  timeLabel: { ...typography.label, color: colors.textFaint, marginBottom: 4 },
  timeValue: { ...typography.h3, color: colors.text },
  pointLabel: { ...typography.bodyStrong, color: colors.text },
  pointAddress: { ...typography.caption, color: colors.textMuted },
  assignmentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  flex1: { flex: 1 },
  assignmentName: { ...typography.bodyStrong, color: colors.text },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  ratingText: { ...typography.caption, color: colors.textMuted },
  plateText: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  reportButton: { marginTop: spacing.sm },
});
