import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ServiceNotice } from "../hooks/useServiceStatusNotice";
import { colors, radius, spacing, typography } from "../constants/theme";

const TONES = {
  info: { color: colors.info, bg: colors.infoMuted, icon: "information-circle" },
  success: { color: colors.brand, bg: colors.brandMuted, icon: "checkmark-circle" },
  danger: { color: colors.danger, bg: colors.dangerMuted, icon: "close-circle" },
} as const;

/** Aviso en vivo del estado del viaje (lo anuncia el lector de pantalla). */
export function ServiceNoticeBanner({ notice, onDismiss }: { notice: ServiceNotice | null; onDismiss: () => void }) {
  if (!notice) return null;
  const tone = TONES[notice.tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.color }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={tone.icon} size={22} color={tone.color} />
      <View style={styles.flex}>
        <Text style={[styles.title, { color: tone.color }]}>{notice.title}</Text>
        <Text style={styles.message}>{notice.message}</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar aviso">
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  flex: { flex: 1 },
  title: { ...typography.bodyStrong },
  message: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
