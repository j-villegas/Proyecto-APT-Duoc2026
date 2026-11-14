import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, spacing, typography } from "../constants/theme";

export interface Step {
  /** Identificador único (por defecto, label). */
  key?: string;
  label: string;
  time?: string;
  state: "done" | "active" | "pending";
}

export function StatusStepper({ steps }: { steps: Step[] }) {
  return (
    <View>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <View key={step.key ?? step.label} style={styles.row}>
            <View style={styles.markerColumn}>
              {step.state === "done" ? (
                <View style={[styles.marker, styles.markerDone]}>
                  <Ionicons name="checkmark" size={12} color={colors.background} />
                </View>
              ) : step.state === "active" ? (
                <View style={[styles.marker, styles.markerActive]} />
              ) : (
                <View style={[styles.marker, styles.markerPending]} />
              )}
              {!isLast ? (
                <View
                  style={[
                    styles.connector,
                    step.state === "done" && styles.connectorDone,
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.textColumn}>
              <Text
                style={[
                  styles.label,
                  step.state === "pending" && styles.labelPending,
                  step.state === "active" && styles.labelActive,
                ]}
              >
                {step.label}
              </Text>
              {step.time ? <Text style={styles.time}>{step.time}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  markerColumn: { width: 24, alignItems: "center" },
  marker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  markerDone: { backgroundColor: colors.brand },
  markerActive: {
    backgroundColor: colors.background,
    borderWidth: 3,
    borderColor: colors.brand,
  },
  markerPending: {
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 20,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  connectorDone: { backgroundColor: colors.brand },
  textColumn: { flex: 1, paddingBottom: spacing.lg, paddingLeft: spacing.sm },
  label: { ...typography.bodyStrong, color: colors.text },
  labelActive: { color: colors.brand },
  labelPending: { color: colors.textFaint, fontFamily: fonts.regular },
  time: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
