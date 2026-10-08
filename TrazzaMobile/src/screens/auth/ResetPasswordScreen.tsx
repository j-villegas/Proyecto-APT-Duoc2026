import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { TrazzaLogo } from "../../components/TrazzaLogo";
import { colors, spacing, typography } from "../../constants/theme";

export const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen() {
  const { session, updatePassword, finishPasswordRecovery, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    setLoading(false);
    if (updateError) {
      setError("No pudimos actualizar la contraseña. Solicita un nuevo enlace e intenta otra vez.");
      return;
    }
    finishPasswordRecovery();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.brandBlock}>
            <TrazzaLogo size={48} />
            <Text style={styles.title}>Nueva contraseña</Text>
            {session?.user.email ? (
              <Text style={styles.subtitle}>para {session.user.email}</Text>
            ) : null}
          </View>

          <TextField
            label="Nueva contraseña"
            icon="lock-closed-outline"
            placeholder="••••••••"
            secret
            value={password}
            onChangeText={setPassword}
          />
          <TextField
            label="Confirmar contraseña"
            icon="lock-closed-outline"
            placeholder="••••••••"
            secret
            value={confirm}
            onChangeText={setConfirm}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Guardar contraseña"
            onPress={handleSubmit}
            loading={loading}
            style={styles.submit}
          />
          <TouchableOpacity style={styles.cancel} onPress={signOut} hitSlop={8}>
            <Text style={styles.cancelLabel}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.xs,
  },
  brandBlock: { alignItems: "center", marginBottom: spacing.xxl },
  title: { ...typography.h2, color: colors.text, marginTop: spacing.lg },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  submit: { marginTop: spacing.xl },
  cancel: { alignSelf: "center", marginTop: spacing.lg },
  cancelLabel: { ...typography.captionStrong, color: colors.textMuted },
});
