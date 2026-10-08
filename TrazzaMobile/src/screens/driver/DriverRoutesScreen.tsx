import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { getDriverServices } from "../../services/services";
import type { Service } from "../../types/database";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { formatTime } from "../../utils/format";
import type { DriverStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<DriverStackParamList>;

type Filter = "todas" | "hoy" | "manana" | "semana";

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export default function DriverRoutesScreen({ navigation }: { navigation: Nav }) {
  const { profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [filter, setFilter] = useState<Filter>("todas");

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      getDriverServices(profile.id)
        .then(setServices)
        .catch(() => setServices([]));
    }, [profile])
  );

  const filtered = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const weekAhead = new Date(now);
    weekAhead.setDate(now.getDate() + 7);

    return services.filter((s) => {
      const date = new Date(s.scheduled_at);
      if (filter === "hoy") return isSameDay(date, now);
      if (filter === "manana") return isSameDay(date, tomorrow);
      if (filter === "semana") return date >= now && date <= weekAhead;
      return true;
    });
  }, [services, filter]);

  const filters: { key: Filter; label: string }[] = [
    { key: "todas", label: `Todas (${services.length})` },
    { key: "hoy", label: "Hoy" },
    { key: "manana", label: "Mañana" },
    { key: "semana", label: "Esta Semana" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Rutas Programadas</Text>
        <Text style={styles.subtitle}>Gestiona tus próximos servicios asignados</Text>
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Ionicons name="map-outline" size={26} color={colors.textMuted} />
            <Text style={styles.emptyText}>No hay rutas para este filtro.</Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.code}>{item.code}</Text>
              <StatusBadge status={item.status} />
            </View>
            <View style={styles.routeRow}>
              <View style={styles.markerColumn}>
                <View style={styles.originDot} />
                <View style={styles.connector} />
                <View style={styles.destDot} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.pointLabel}>{item.origin_label}</Text>
                <Text style={styles.pointMeta}>{item.passenger_count} pasajeros</Text>
                <Text style={[styles.pointLabel, styles.destLabel]}>{item.destination_label}</Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.time}>{formatTime(item.scheduled_at)}</Text>
              <Button
                label="Preparar ruta"
                onPress={() => navigation.navigate("RouteDetail", { serviceId: item.id })}
                style={styles.button}
              />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.brandMuted, borderColor: colors.brand },
  filterLabel: { ...typography.captionStrong, color: colors.textMuted },
  filterLabelActive: { color: colors.brand },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  card: { gap: spacing.md, marginBottom: spacing.md },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { ...typography.h3, color: colors.text },
  routeRow: { flexDirection: "row" },
  markerColumn: { width: 20, alignItems: "center" },
  originDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: colors.brand },
  destDot: { width: 8, height: 8, borderRadius: 2, backgroundColor: colors.brand },
  connector: { width: 1, flex: 1, minHeight: 24, backgroundColor: colors.borderStrong, marginVertical: 4 },
  flex1: { flex: 1 },
  pointLabel: { ...typography.bodyStrong, color: colors.text },
  pointMeta: { ...typography.caption, color: colors.textMuted, marginVertical: 4 },
  destLabel: { marginTop: 2 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { ...typography.h3, color: colors.text },
  button: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  emptyCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyText: { ...typography.caption, color: colors.textMuted },
});
