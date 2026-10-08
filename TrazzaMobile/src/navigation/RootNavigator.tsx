import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { AuthNavigator } from "./AuthNavigator";
import { PassengerNavigator } from "./PassengerNavigator";
import { DriverNavigator } from "./DriverNavigator";
import ResetPasswordScreen from "../screens/auth/ResetPasswordScreen";
import { colors } from "../constants/theme";
import { TrazzaLogo } from "../components/TrazzaLogo";

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    border: colors.border,
    primary: colors.brand,
    text: colors.text,
  },
};

export function RootNavigator() {
  const { session, profile, loading, passwordRecovery } = useAuth();

  // Al volver del enlace de recuperación esperamos la sesión antes de pedir la nueva contraseña.
  if (loading || (passwordRecovery && !session)) {
    return (
      <View style={styles.splash}>
        <TrazzaLogo size={64} />
        <ActivityIndicator color={colors.brand} style={styles.spinner} />
      </View>
    );
  }

  if (passwordRecovery) {
    return <ResetPasswordScreen />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {!session || !profile || profile.id !== session.user.id ? (
        <AuthNavigator />
      ) : profile.role === "conductor" ? (
        <DriverNavigator />
      ) : (
        <PassengerNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 24,
  },
  spinner: { marginTop: 12 },
});
