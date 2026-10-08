import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import DriverHomeScreen from "../screens/driver/DriverHomeScreen";
import DriverRoutesScreen from "../screens/driver/DriverRoutesScreen";
import DriverProfileScreen from "../screens/driver/DriverProfileScreen";
import ActiveRouteTabScreen from "../screens/driver/ActiveRouteTabScreen";
import { colors } from "../constants/theme";
import type { DriverTabParamList } from "./types";

const Tab = createBottomTabNavigator<DriverTabParamList>();

const ICONS: Record<keyof DriverTabParamList, keyof typeof Ionicons.glyphMap> = {
  DriverHome: "home",
  DriverRoutes: "map",
  DriverActive: "navigate",
  DriverProfile: "person",
};

const LABELS: Record<keyof DriverTabParamList, string> = {
  DriverHome: "Inicio",
  DriverRoutes: "Rutas",
  DriverActive: "En ruta",
  DriverProfile: "Perfil",
};

export function DriverTabs() {
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
          <Ionicons name={ICONS[route.name as keyof DriverTabParamList]} color={color} size={22} />
        ),
        tabBarLabel: LABELS[route.name as keyof DriverTabParamList],
      })}
    >
      <Tab.Screen name="DriverHome" component={DriverHomeScreen as React.ComponentType} />
      <Tab.Screen name="DriverRoutes" component={DriverRoutesScreen as React.ComponentType} />
      <Tab.Screen name="DriverActive" component={ActiveRouteTabScreen} />
      <Tab.Screen name="DriverProfile" component={DriverProfileScreen} />
    </Tab.Navigator>
  );
}
