import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { RoutePoints } from "../../components/RoutePoints";
import { getNextServiceForPassenger } from "../../services/services";
import type { Service } from "../../types/database";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { formatTime } from "../../utils/format";
import type { PassengerStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<PassengerStackParamList>;

export default function PassengerHomeScreen({ navigation }: { navigation: Nav }) {
  const { profile } = useAuth();
  const [trip, setTrip] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!profile?.passenger_id) return;
    try {
      const next = await getNextServiceForPassenger(profile.passenger_id);
      setTrip(next);
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
            <Text style={styles.greeting}>Hola, {firstName || "viajero"}</Text>
            <Text style={styles.subGreeting}>
              {trip ? "Tu próximo traslado" : "No tienes traslados programados"}
            </Text>
          </View>
        </View>

        {!loading && trip ? (
          <Card style={styles.tripCard}>
            <View style={styles.tripTimeRow}>
              <View>
                <Text style={styles.tripTime}>{formatTime(trip.scheduled_at)}</Text>
                <Text style={styles.tripDay}>Hoy</Text>
              </View>
              <StatusBadge status={trip.status} />
            </View>

            <RoutePoints
              originLabel={trip.origin_label}
              destinationLabel={trip.destination_label}
            />

            {trip.contract_name ? (
              <View style={styles.tag}>
                <Ionicons name="bus-outline" size={14} color={colors.textMuted} />
                <Text style={styles.tagText}>{trip.contract_name}</Text>
              </View>
            ) : null}

            <Button
              label="Ver detalle del viaje"
              onPress={() => navigation.navigate("TripDetail", { serviceId: trip.id })}
              style={styles.tripButton}
            />
          </Card>
        ) : null}

        {!loading && loadError ? (
          <ErrorState what="tu próximo viaje" error={loadError} onRetry={load} />
        ) : null}

        {!loading && !trip && !loadError ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              Cuando tengas un viaje asignado, aparecerá aquí con toda la información de tu conductor.
            </Text>
          </Card>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greeting: { ...typography.h1, color: colors.text },
  subGreeting: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  tripCard: { gap: spacing.md },
  tripTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  tripTime: { ...typography.h1, color: colors.text },
  tripDay: { ...typography.caption, color: colors.textMuted },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  tagText: { ...typography.caption, color: colors.textMuted },
  tripButton: { marginTop: spacing.xs },
  emptyCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyText: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
