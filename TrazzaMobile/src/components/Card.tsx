import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { colors, radius, spacing } from "../constants/theme";

interface CardProps extends ViewProps {
  padded?: boolean;
}

export function Card({ style, padded = true, children, ...rest }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: {
    padding: spacing.lg,
  },
});
