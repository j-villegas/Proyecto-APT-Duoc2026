import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "../constants/theme";

interface TextFieldProps extends TextInputProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Campo de contraseña con botón para mostrar/ocultar. */
  secret?: boolean;
}

export function TextField({ label, icon, secret = false, style, ...rest }: TextFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={secret && !visible}
          accessibilityLabel={label}
          {...rest}
        />
        {secret ? (
          <Ionicons
            name={visible ? "eye-off-outline" : "eye-outline"}
            size={18}
            color={colors.textMuted}
            onPress={() => setVisible((v) => !v)}
            accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          />
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.captionStrong,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    color: colors.text,
    ...typography.body,
  },
});
