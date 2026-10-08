import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenHeader } from "../../components/ScreenHeader";
import { TripTrackingView } from "../../components/TripTrackingView";
import { colors } from "../../constants/theme";
import type { PassengerStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<PassengerStackParamList, "TripTracking">;

export default function TripTrackingScreen({ route, navigation }: Props) {
  const { serviceId } = route.params;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="Seguimiento del Viaje" onBack={navigation.goBack} />
      <TripTrackingView
        serviceId={serviceId}
        onReportIncident={(id) => navigation.navigate("ReportIncident", { serviceId: id })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
