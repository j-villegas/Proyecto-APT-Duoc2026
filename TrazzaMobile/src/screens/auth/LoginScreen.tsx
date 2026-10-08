import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { TrazzaLogo } from "../../components/TrazzaLogo";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, spacing, typography } from "../../constants/theme";
import type { AuthStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const { signIn, profileError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    setLoading(false);
    if (signInError) {
      setError("Credenciales inválidas. Verifica tus datos e intenta de nuevo.");
    }
  };

  const shownError = error ?? profileError;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.brandBlock}>
            <TrazzaLogo size={64} />
            <Text style={styles.brandName}>TRAZZA</Text>
            <Text style={styles.slogan}>rutas, flota y conductores en línea</Text>
          </View>

          <View style={styles.form}>
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

            <TextField
              label="Contraseña"
              icon="lock-closed-outline"
              placeholder="••••••••"
              secret
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={styles.forgot}
              onPress={() => navigation.navigate("ForgotPassword", { email: email.trim() })}
              hitSlop={8}
            >
              <Text style={styles.forgotLabel}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            {shownError ? <Text style={styles.error}>{shownError}</Text> : null}

            <Button
              label="Iniciar sesión"
              onPress={handleSubmit}
              loading={loading}
              style={styles.submit}
            />
          </View>

          <Text style={styles.footer}>© {new Date().getFullYear()} TRAZZA</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: spacing.xxxl,
  },
  brandName: {
    ...typography.h1,
    color: colors.text,
    letterSpacing: 2,
    marginTop: spacing.lg,
  },
  slogan: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.xs,
  },
  forgot: {
    alignSelf: "flex-end",
    marginTop: spacing.sm,
  },
  forgotLabel: {
    ...typography.captionStrong,
    color: colors.brand,
  },
  error: {
    color: colors.danger,
    ...typography.caption,
    marginTop: spacing.sm,
  },
  submit: {
    marginTop: spacing.xl,
  },
  footer: {
    textAlign: "center",
    color: colors.textFaint,
    ...typography.caption,
    marginTop: spacing.xxxl,
  },
});
