import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PassengerTabs } from "./PassengerTabs";
import TripDetailScreen from "../screens/passenger/TripDetailScreen";
import TripTrackingScreen from "../screens/passenger/TripTrackingScreen";
import ReportIncidentScreen from "../screens/passenger/ReportIncidentScreen";
import { colors } from "../constants/theme";
import type { PassengerStackParamList } from "./types";

const Stack = createNativeStackNavigator<PassengerStackParamList>();

export function PassengerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="PassengerTabs" component={PassengerTabs} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} />
      <Stack.Screen name="TripTracking" component={TripTrackingScreen} />
      <Stack.Screen name="ReportIncident" component={ReportIncidentScreen} />
    </Stack.Navigator>
  );
}
