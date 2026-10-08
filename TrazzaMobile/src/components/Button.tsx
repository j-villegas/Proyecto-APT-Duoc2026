import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
} from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";

type Variant = "primary" | "secondary" | "outline" | "ghost";

interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  label,
  variant = "primary",
  loading = false,
  icon,
  style,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled || loading}
      style={[
        styles.base,
        variantStyles[variant],
        (disabled || loading) && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.background : colors.text} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, labelVariantStyles[variant]]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.bodyStrong,
  },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: "transparent" },
});

const labelVariantStyles = StyleSheet.create({
  primary: { color: colors.background },
  secondary: { color: colors.text },
  outline: { color: colors.text },
  ghost: { color: colors.brand },
});
