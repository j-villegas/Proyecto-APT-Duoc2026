import React, { useCallback, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { ProfileScreenBase } from "../../components/ProfileScreenBase";
import { Card } from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { getDriverProfileDetails, type DriverProfileDetails } from "../../services/services";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { daysUntil, formatDate } from "../../utils/format";

/** Aviso de vencimiento de licencia, igual criterio que las alertas del panel. */
function licenseStatus(expiresAt: string | null) {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  if (days < 0) return { text: "Vencida. Renuévala antes de tu próximo servicio.", color: colors.danger, bg: colors.dangerMuted };
  if (days <= 30) return { text: `Vence en ${days} día${days === 1 ? "" : "s"}.`, color: colors.warning, bg: colors.warningMuted };
  return null;
}

export default function DriverProfileScreen() {
  const { profile } = useAuth();
  const [details, setDetails] = useState<DriverProfileDetails | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile?.driver_id) return;
      getDriverProfileDetails(profile.driver_id, profile.company_id)
        .then(setDetails)
        .catch(() => setDetails(null));
    }, [profile])
  );

  const license = licenseStatus(details?.licenseExpiresAt ?? null);
  const contact = details?.companyPhone
    ? { label: `Llamar a la central${details.companyName ? ` · ${details.companyName}` : ""}`, url: `tel:${details.companyPhone}` }
    : details?.companyEmail
      ? { label: "Escribir a la central", url: `mailto:${details.companyEmail}` }
      : null;

  return (
    <ProfileScreenBase
      roleLabel="Conductor"
      items={contact ? [{ icon: "call-outline", label: contact.label, onPress: () => Linking.openURL(contact.url) }] : []}
    >
      {details && (details.licenseType || details.licenseNumber || details.licenseExpiresAt) ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>LICENCIA DE CONDUCIR</Text>
          <View style={styles.row}>
            <Ionicons name="card-outline" size={20} color={colors.textMuted} />
            <View style={styles.flex1}>
              <Text style={styles.value}>
                {details.licenseType ? `Clase ${details.licenseType}` : "Clase no registrada"}
                {details.licenseNumber ? ` · N° ${details.licenseNumber}` : ""}
              </Text>
              <Text style={styles.meta}>Vence: {formatDate(details.licenseExpiresAt)}</Text>
            </View>
          </View>
          {license ? (
            <View style={[styles.alert, { backgroundColor: license.bg }]} accessibilityRole="alert">
              <Ionicons name="warning-outline" size={16} color={license.color} />
              <Text style={[styles.alertText, { color: license.color }]}>{license.text}</Text>
            </View>
          ) : null}
        </Card>
      ) : null}
    </ProfileScreenBase>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  sectionTitle: { ...typography.label, color: colors.textFaint },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  flex1: { flex: 1 },
  value: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  alert: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  alertText: { ...typography.caption, flex: 1 },
});
