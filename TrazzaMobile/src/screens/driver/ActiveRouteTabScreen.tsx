import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { DriverActiveRouteView } from "../../components/DriverActiveRouteView";
import { Card } from "../../components/Card";
import { getDriverServices } from "../../services/services";
import { colors, spacing, typography } from "../../constants/theme";
import type { DriverStackParamList } from "../../navigation/types";

export default function ActiveRouteTabScreen() {
  const { profile } = useAuth();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NativeStackNavigationProp<DriverStackParamList>>();

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      setLoading(true);
      getDriverServices(profile.id)
        .then((list) => {
          const active = list.find((s) => s.status === "en_ruta" || s.status === "en_camino");
          setServiceId(active?.id ?? null);
        })
        .catch(() => setServiceId(null))
        .finally(() => setLoading(false));
    }, [profile])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (!serviceId) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}>
          <Card style={styles.emptyCard}>
            <Ionicons name="navigate-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin ruta activa</Text>
            <Text style={styles.emptyText}>
              Prepara un servicio desde la pestaña Rutas para comenzar a transmitir tu ubicación.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <DriverActiveRouteView
        serviceId={serviceId}
        onReportIncident={(id) => navigation.navigate("DriverReportIncident", { serviceId: id })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  emptyCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyTitle: { ...typography.h3, color: colors.text },
  emptyText: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
