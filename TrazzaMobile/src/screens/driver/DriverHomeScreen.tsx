import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { getDriverServices, getVehicleById } from "../../services/services";
import type { Service, Vehicle } from "../../types/database";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { formatTime } from "../../utils/format";
import type { DriverStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<DriverStackParamList>;

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function DriverHomeScreen({ navigation }: { navigation: Nav }) {
  const { profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.driver_id) return;
    try {
      const list = await getDriverServices(profile.driver_id);
      setServices(list);
      if (list[0]?.vehicle_id) {
        const veh = await getVehicleById(list[0].vehicle_id);
        setVehicle(veh);
      }
    } catch {
      setServices([]);
    } finally {
      setRefreshing(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const todayServices = services.filter((s) => isToday(s.scheduled_at));
  const nextService = services.find((s) => s.status !== "finalizado" && s.status !== "cancelado");
  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola, {firstName || "conductor"}</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Disponible</Text>
            </View>
          </View>
          <TouchableOpacity hitSlop={12}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>SERVICIOS HOY</Text>
            <Text style={styles.statValue}>{todayServices.length}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statLabel}>PRÓXIMO INICIO</Text>
            <Text style={styles.statValue}>
              {nextService ? formatTime(nextService.scheduled_at) : "--:--"}
            </Text>
          </Card>
        </View>

        {vehicle ? (
          <Card style={styles.vehicleCard}>
            <Ionicons name="bus-outline" size={20} color={colors.brand} />
            <Text style={styles.vehicleText}>
              {vehicle.brand} {vehicle.model} · {vehicle.plate}
            </Text>
          </Card>
        ) : null}

        <Text style={styles.sectionTitle}>PRÓXIMO SERVICIO</Text>
        {nextService ? (
          <Card style={styles.serviceCard}>
            <View style={styles.serviceHeader}>
              <View>
                <Text style={styles.serviceCode}>{nextService.code}</Text>
                <Text style={styles.serviceTime}>
                  {formatTime(nextService.scheduled_at)} · {nextService.origin_label}
                </Text>
              </View>
              <StatusBadge status={nextService.status} />
            </View>
            <View style={styles.serviceFooter}>
              <View style={styles.pill}>
                <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                <Text style={styles.pillText}>{nextService.passenger_count} pasajeros</Text>
              </View>
              <Button
                label="Ver ruta"
                variant="secondary"
                onPress={() => navigation.navigate("RouteDetail", { serviceId: nextService.id })}
                style={styles.viewButton}
              />
            </View>
          </Card>
        ) : (
          <Card style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={24} color={colors.textMuted} />
            <Text style={styles.emptyText}>No tienes servicios próximos.</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { ...typography.h1, color: colors.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  statusText: { ...typography.caption, color: colors.textMuted },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statCard: { flex: 1, gap: spacing.xs },
  statLabel: { ...typography.label, color: colors.textFaint },
  statValue: { ...typography.h2, color: colors.text },
  vehicleCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  vehicleText: { ...typography.bodyStrong, color: colors.text },
  sectionTitle: { ...typography.label, color: colors.textFaint },
  serviceCard: { gap: spacing.md },
  serviceHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  serviceCode: { ...typography.h3, color: colors.text },
  serviceTime: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  serviceFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  pillText: { ...typography.caption, color: colors.textMuted },
  viewButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  emptyCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...typography.caption, color: colors.textMuted },
});
