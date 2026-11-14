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
import { formatDateTime, formatTime } from "../../utils/format";
import { buildServiceTimeline, driverActionFor } from "../../utils/serviceStatus";
import type { DriverStackParamList } from "../../navigation/types";
import { friendlyError } from "../../lib/errors";

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
        setError(friendlyError(err));
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

  const action = driverActionFor(service.status);
  const timeline = buildServiceTimeline(service, stops);

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

        {timeline.length > 1 ? (
          <>
            <Text style={styles.sectionTitle}>REGISTRO DEL SERVICIO</Text>
            <Card style={styles.timelineCard}>
              {timeline.map((entry) => (
                <View key={entry.key} style={styles.timelineRow}>
                  <View
                    style={[
                      styles.timelineDot,
                      entry.tone === "done" && styles.timelineDotDone,
                      entry.tone === "danger" && styles.timelineDotDanger,
                    ]}
                  />
                  <View style={styles.flex1}>
                    <Text style={styles.stopLabel}>{entry.label}</Text>
                    {entry.detail ? <Text style={styles.stopAddress}>{entry.detail}</Text> : null}
                  </View>
                  <Text style={styles.timelineTime}>{formatDateTime(entry.at)}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>

      {action.kind !== "view" ? (
        <View style={styles.footer}>
          <Button
            label={action.label}
            icon={<Ionicons name="arrow-forward" size={16} color={colors.background} />}
            onPress={() =>
              action.kind === "continue"
                ? navigation.navigate("ActiveRoute", { serviceId })
                : navigation.navigate("PrepareService", { serviceId })
            }
          />
        </View>
      ) : null}
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
  timelineCard: { gap: spacing.md },
  timelineRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.borderStrong, marginTop: 5 },
  timelineDotDone: { backgroundColor: colors.brand },
  timelineDotDanger: { backgroundColor: colors.danger },
  timelineTime: { ...typography.caption, color: colors.textMuted },
});
