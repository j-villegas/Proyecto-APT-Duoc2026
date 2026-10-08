import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import type { ServiceStatus } from "../types/database";

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bg: string }> = {
  programado: { label: "PROGRAMADO", color: colors.warning, bg: colors.warningMuted },
  en_espera: { label: "EN ESPERA", color: colors.warning, bg: colors.warningMuted },
  en_camino: { label: "EN CAMINO", color: colors.brand, bg: colors.brandMuted },
  en_ruta: { label: "EN RUTA", color: colors.brand, bg: colors.brandMuted },
  finalizado: { label: "FINALIZADO", color: colors.info, bg: colors.infoMuted },
  cancelado: { label: "CANCELADO", color: colors.danger, bg: colors.dangerMuted },
};

export function StatusBadge({ status }: { status: ServiceStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...typography.label,
  },
});
