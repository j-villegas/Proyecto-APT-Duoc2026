import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { getServiceById, getServiceStops, getVehicleById } from "../../services/services";
import type { Service, ServiceStop, Vehicle } from "../../types/database";
import { colors, spacing, typography } from "../../constants/theme";
import { formatTime } from "../../utils/format";
import type { DriverStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<DriverStackParamList, "RouteDetail">;

export default function RouteDetailScreen({ route, navigation }: Props) {
  const { serviceId } = route.params;
  const [service, setService] = useState<Service | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [stops, setStops] = useState<ServiceStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const svc = await getServiceById(serviceId);
        setService(svc);
        const [veh, stopList] = await Promise.all([
          svc.vehicle_id ? getVehicleById(svc.vehicle_id) : Promise.resolve(null),
          getServiceStops(serviceId),
        ]);
        setVehicle(veh);
        setStops(stopList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la ruta.");
      } finally {
        setLoading(false);
      }
    })();
  }, [serviceId]);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Detalle de Ruta" onBack={navigation.goBack} />
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
        <ScreenHeader title="Detalle de Ruta" onBack={navigation.goBack} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader
        title={service.code}
        subtitle={service.contract_name ?? undefined}
        onBack={navigation.goBack}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeRow}>
          <StatusBadge status={service.status} />
        </View>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>HORA DE INICIO</Text>
            <Text style={styles.statValue}>{formatTime(service.scheduled_at)}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>VEHÍCULO ASIGNADO</Text>
            <Text style={styles.statValue}>{vehicle?.model ?? "-"}</Text>
          </Card>
        </View>

        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>PASAJEROS TOTALES</Text>
          <Text style={styles.statValue}>{service.passenger_count} Pasajeros</Text>
        </Card>

        <Text style={styles.sectionTitle}>ITINERARIO</Text>
        <Card style={styles.itineraryCard}>
          <View style={styles.stopRow}>
            <View style={styles.originDot} />
            <View style={styles.flex1}>
              <Text style={styles.stopLabel}>{service.origin_label}</Text>
              <Text style={styles.stopAddress}>{service.origin_address}</Text>
            </View>
          </View>
          <View style={styles.connector} />
          <View style={styles.stopRow}>
            <View style={styles.midDot} />
            <View style={styles.flex1}>
              <Text style={styles.stopLabel}>Paradas intermedias</Text>
              <Text style={styles.stopAddress}>
                {stops.length} paradas · {stops.filter((s) => s.status !== "pendiente").length} confirmadas
              </Text>
            </View>
          </View>
          <View style={styles.connector} />
          <View style={styles.stopRow}>
            <View style={styles.destDot} />
            <View style={styles.flex1}>
              <Text style={styles.stopLabel}>{service.destination_label}</Text>
              <Text style={styles.stopAddress}>{service.destination_address}</Text>
            </View>
          </View>
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Preparar ruta"
          icon={<Ionicons name="arrow-forward" size={16} color={colors.background} />}
          onPress={() => navigation.navigate("PrepareService", { serviceId })}
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
  statsRow: { flexDirection: "row", gap: spacing.md },
  statCard: { flex: 1, gap: spacing.xs },
  statLabel: { ...typography.label, color: colors.textFaint },
  statValue: { ...typography.h3, color: colors.text },
  sectionTitle: { ...typography.label, color: colors.textFaint, marginTop: spacing.sm },
  itineraryCard: { gap: 0 },
  stopRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  originDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.brand, marginTop: 4 },
  midDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, marginTop: 4 },
  destDot: { width: 12, height: 12, borderRadius: 3, backgroundColor: colors.brand, marginTop: 4 },
  connector: { width: 1, height: 24, backgroundColor: colors.borderStrong, marginLeft: 6, marginVertical: 2 },
  flex1: { flex: 1 },
  stopLabel: { ...typography.bodyStrong, color: colors.text },
  stopAddress: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
