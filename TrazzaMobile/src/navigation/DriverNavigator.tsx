import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { DriverTabs } from "./DriverTabs";
import RouteDetailScreen from "../screens/driver/RouteDetailScreen";
import PrepareServiceScreen from "../screens/driver/PrepareServiceScreen";
import ActiveRouteScreen from "../screens/driver/ActiveRouteScreen";
import DriverReportIncidentScreen from "../screens/driver/DriverReportIncidentScreen";
import { colors } from "../constants/theme";
import type { DriverStackParamList } from "./types";

const Stack = createNativeStackNavigator<DriverStackParamList>();

export function DriverNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="DriverTabs" component={DriverTabs} />
      <Stack.Screen name="RouteDetail" component={RouteDetailScreen} />
      <Stack.Screen name="PrepareService" component={PrepareServiceScreen} />
      <Stack.Screen name="ActiveRoute" component={ActiveRouteScreen} />
      <Stack.Screen name="DriverReportIncident" component={DriverReportIncidentScreen} />
    </Stack.Navigator>
  );
}
