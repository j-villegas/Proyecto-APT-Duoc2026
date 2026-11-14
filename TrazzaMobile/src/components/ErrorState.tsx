import React from "react";
import { StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { Button } from "./Button";
import { friendlyError, isNetworkError } from "../lib/errors";
import { colors, spacing, typography } from "../constants/theme";

interface Props {
  /** Qué se intentaba cargar, p. ej. "tus rutas". */
  what: string;
  error: unknown;
  onRetry: () => void;
}

/**
 * Estado de error con reintento. Distinto del estado vacío: el usuario debe
 * saber que la lista no está vacía, sino que no se pudo cargar.
 */
export function ErrorState({ what, error, onRetry }: Props) {
  const offline = isNetworkError(error);
  return (
    <Card style={styles.card} accessibilityRole="alert">
      <Ionicons name={offline ? "cloud-offline-outline" : "alert-circle-outline"} size={28} color={colors.warning} />
      <Text style={styles.title}>{offline ? "Sin conexión" : `No pudimos cargar ${what}`}</Text>
      <Text style={styles.text}>{friendlyError(error)}</Text>
      <Button label="Reintentar" variant="outline" onPress={onRetry} style={styles.button} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  title: { ...typography.h3, color: colors.text, textAlign: "center" },
  text: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  button: { alignSelf: "stretch", marginTop: spacing.sm },
});
