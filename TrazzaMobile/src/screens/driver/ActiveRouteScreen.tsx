import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenHeader } from "../../components/ScreenHeader";
import { DriverActiveRouteView } from "../../components/DriverActiveRouteView";
import { colors } from "../../constants/theme";
import type { DriverStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<DriverStackParamList, "ActiveRoute">;

export default function ActiveRouteScreen({ route, navigation }: Props) {
  const { serviceId } = route.params;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="En Ruta" />
      <DriverActiveRouteView
        serviceId={serviceId}
        onReportIncident={(id) => navigation.navigate("DriverReportIncident", { serviceId: id })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
