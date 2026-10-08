import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Button } from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import { createIncident } from "../../services/incidents";
import type { IncidentType } from "../../types/database";
import { colors, radius, spacing, typography } from "../../constants/theme";
import type { PassengerStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<PassengerStackParamList, "ReportIncident">;

const CATEGORIES: { key: IncidentType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "frenada_brusca", label: "Frenada brusca", icon: "speedometer-outline" },
  { key: "conduccion_imprudente", label: "Conducción imprudente", icon: "alert-circle-outline" },
  { key: "limpieza_unidad", label: "Limpieza de unidad", icon: "sparkles-outline" },
  { key: "retraso_ruta", label: "Retraso en ruta", icon: "time-outline" },
];

export default function ReportIncidentScreen({ route, navigation }: Props) {
  const { serviceId } = route.params;
  const { profile } = useAuth();
  const [selected, setSelected] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selected) {
      Alert.alert("Selecciona un tipo de incidencia");
      return;
    }
    if (!profile) return;

    setSubmitting(true);
    try {
      await createIncident({
        serviceId,
        reporterId: profile.id,
        category: selected,
        title: CATEGORIES.find((c) => c.key === selected)?.label ?? selected,
        description,
      });
      Alert.alert("Incidencia enviada", "Gracias por tu reporte, nuestro equipo lo revisará.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert("No se pudo enviar", "Intenta nuevamente en unos segundos.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="TRAZZA" onBack={navigation.goBack} rightIcon="notifications-outline" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Reportar Incidencia</Text>
        <Text style={styles.subtitle}>
          Selecciona el tipo de evento y proporcione detalles para registrar el reporte en el sistema.
        </Text>

        <Text style={styles.sectionTitle}>TIPO DE INCIDENCIA</Text>
        <View style={styles.grid}>
          {CATEGORIES.map((category) => {
            const active = selected === category.key;
            return (
              <TouchableOpacity
                key={category.key}
                style={[styles.categoryCard, active && styles.categoryCardActive]}
                onPress={() => setSelected(category.key)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={category.icon}
                  size={22}
                  color={active ? colors.brand : colors.textMuted}
                />
                <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>
                  {category.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>DESCRIPCIÓN DEL EVENTO</Text>
        <TextInput
          style={styles.textarea}
          placeholder="Describa brevemente lo sucedido..."
          placeholderTextColor={colors.textFaint}
          multiline
          numberOfLines={5}
          value={description}
          onChangeText={setDescription}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Enviar reporte" onPress={handleSubmit} loading={submitting} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  sectionTitle: { ...typography.label, color: colors.textFaint, marginTop: spacing.md },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  categoryCard: {
    width: "47%",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  categoryCardActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandMuted,
  },
  categoryLabel: { ...typography.captionStrong, color: colors.textMuted },
  categoryLabelActive: { color: colors.text },
  textarea: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    minHeight: 120,
    textAlignVertical: "top",
    ...typography.body,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
