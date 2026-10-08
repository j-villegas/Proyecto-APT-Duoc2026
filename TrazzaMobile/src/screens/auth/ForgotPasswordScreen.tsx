import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { ScreenHeader } from "../../components/ScreenHeader";
import { TextField } from "../../components/TextField";
import { colors, spacing, typography } from "../../constants/theme";
import type { AuthStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen({ navigation, route }: Props) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error: resetError } = await requestPasswordReset(email);
    setLoading(false);
    if (resetError) {
      setError("No pudimos enviar el correo. Intenta de nuevo en unos minutos.");
      return;
    }
    setSent(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Recuperar contraseña" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          {sent ? (
            <>
              <Text style={styles.title}>Revisa tu correo</Text>
              <Text style={styles.body}>
                Si {email.trim()} tiene una cuenta en TRAZZA, recibirás un enlace para crear una
                nueva contraseña. Ábrelo desde este teléfono.
              </Text>
              <Button
                label="Volver al inicio de sesión"
                onPress={() => navigation.goBack()}
                style={styles.submit}
              />
            </>
          ) : (
            <>
              <Text style={styles.body}>
                Ingresa el correo de tu cuenta y te enviaremos un enlace para restablecer tu
                contraseña.
              </Text>
              <TextField
                label="Correo electrónico"
                icon="mail-outline"
                placeholder="tucorreo@empresa.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                label="Enviar enlace"
                onPress={handleSubmit}
                loading={loading}
                style={styles.submit}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  submit: { marginTop: spacing.xl },
});
