import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../constants/theme";

// react-native-maps no funciona en web: la vista previa del navegador muestra
// un recuadro en lugar del mapa para poder revisar el resto de cada pantalla.

export const PROVIDER_GOOGLE = "google";

export function Marker(_props: object) {
  return null;
}

export default function MapView({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[style, styles.placeholder]}>
      <Ionicons name="map-outline" size={28} color={colors.textFaint} />
      <Text style={styles.text}>El mapa solo está disponible en la app móvil</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  text: { color: colors.textFaint, fontSize: 13 },
});
