import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import { TripTrackingView } from "../../components/TripTrackingView";
import { Card } from "../../components/Card";
import { getNextServiceForPassenger } from "../../services/services";
import { colors, spacing, typography } from "../../constants/theme";
import type { PassengerStackParamList, PassengerTabParamList } from "../../navigation/types";

type TabProps = BottomTabScreenProps<PassengerTabParamList, "PassengerTrip">;

export default function ActiveTripTabScreen(_props: TabProps) {
  const { profile } = useAuth();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NativeStackNavigationProp<PassengerStackParamList>>();

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      setLoading(true);
      getNextServiceForPassenger(profile.id)
        .then((service) => setServiceId(service?.id ?? null))
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
            <Text style={styles.emptyTitle}>Sin viaje activo</Text>
            <Text style={styles.emptyText}>
              Cuando tengas un viaje en curso, aquí podrás seguir la ubicación de tu conductor en tiempo real.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TripTrackingView
        serviceId={serviceId}
        onReportIncident={(id) => navigation.navigate("ReportIncident", { serviceId: id })}
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
