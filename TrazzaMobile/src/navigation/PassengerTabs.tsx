import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import PassengerHomeScreen from "../screens/passenger/PassengerHomeScreen";
import PassengerHistoryScreen from "../screens/passenger/PassengerHistoryScreen";
import PassengerProfileScreen from "../screens/passenger/PassengerProfileScreen";
import ActiveTripTabScreen from "../screens/passenger/ActiveTripTabScreen";
import { colors } from "../constants/theme";
import type { PassengerTabParamList } from "./types";

const Tab = createBottomTabNavigator<PassengerTabParamList>();

const ICONS: Record<keyof PassengerTabParamList, keyof typeof Ionicons.glyphMap> = {
  PassengerHome: "home",
  PassengerTrip: "navigate",
  PassengerHistory: "time",
  PassengerProfile: "person",
};

const LABELS: Record<keyof PassengerTabParamList, string> = {
  PassengerHome: "Inicio",
  PassengerTrip: "Viaje",
  PassengerHistory: "Historial",
  PassengerProfile: "Perfil",
};

export function PassengerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.backgroundAlt,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color }) => (
          <Ionicons name={ICONS[route.name as keyof PassengerTabParamList]} color={color} size={22} />
        ),
        tabBarLabel: LABELS[route.name as keyof PassengerTabParamList],
      })}
    >
      <Tab.Screen name="PassengerHome" component={PassengerHomeScreen as React.ComponentType} />
      <Tab.Screen name="PassengerTrip" component={ActiveTripTabScreen} />
      <Tab.Screen name="PassengerHistory" component={PassengerHistoryScreen as React.ComponentType} />
      <Tab.Screen name="PassengerProfile" component={PassengerProfileScreen} />
    </Tab.Navigator>
  );
}
