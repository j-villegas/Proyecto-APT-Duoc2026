import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/Card";
import { StatusBadge } from "../../components/StatusBadge";
import { getPassengerHistory } from "../../services/services";
import type { Service } from "../../types/database";
import { colors, spacing, typography } from "../../constants/theme";
import { formatDayLabel, formatTime } from "../../utils/format";
import type { PassengerStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<PassengerStackParamList>;

export default function PassengerHistoryScreen({ navigation }: { navigation: Nav }) {
  const { profile } = useAuth();
  const [trips, setTrips] = useState<Service[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      getPassengerHistory(profile.id)
        .then(setTrips)
        .catch(() => setTrips([]));
    }, [profile])
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial</Text>
      </View>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Ionicons name="time-outline" size={26} color={colors.textMuted} />
            <Text style={styles.emptyText}>Aún no tienes viajes registrados.</Text>
          </Card>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate("TripDetail", { serviceId: item.id })}>
            <Card style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.day}>{formatDayLabel(item.scheduled_at)}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.time}>{formatTime(item.scheduled_at)}</Text>
              <Text style={styles.route}>
                {item.origin_label} → {item.destination_label}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { ...typography.h1, color: colors.text },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.xs, marginBottom: spacing.md },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  day: { ...typography.captionStrong, color: colors.textMuted },
  time: { ...typography.h3, color: colors.text },
  route: { ...typography.caption, color: colors.textMuted },
  emptyCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyText: { ...typography.caption, color: colors.textMuted },
});
