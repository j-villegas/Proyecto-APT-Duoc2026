import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";

interface RoutePointsProps {
  originLabel: string;
  originAddress?: string;
  destinationLabel: string;
  destinationAddress?: string;
}

export function RoutePoints({
  originLabel,
  originAddress,
  destinationLabel,
  destinationAddress,
}: RoutePointsProps) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.markerColumn}>
          <View style={styles.originDot} />
          <View style={styles.connector} />
        </View>
        <View style={styles.textColumn}>
          <Text style={styles.eyebrow}>ORIGEN</Text>
          <Text style={styles.label}>{originLabel}</Text>
          {originAddress ? <Text style={styles.address}>{originAddress}</Text> : null}
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.markerColumn}>
          <View style={styles.destinationDot} />
        </View>
        <View style={styles.textColumn}>
          <Text style={styles.eyebrow}>DESTINO</Text>
          <Text style={styles.label}>{destinationLabel}</Text>
          {destinationAddress ? <Text style={styles.address}>{destinationAddress}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
  markerColumn: {
    width: 20,
    alignItems: "center",
  },
  originDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: colors.background,
    marginTop: 4,
  },
  destinationDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.brand,
    marginTop: 4,
  },
  connector: {
    width: 1,
    flex: 1,
    minHeight: 24,
    backgroundColor: colors.borderStrong,
    marginVertical: 4,
  },
  textColumn: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    ...typography.label,
    color: colors.textFaint,
    marginBottom: 2,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  address: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
