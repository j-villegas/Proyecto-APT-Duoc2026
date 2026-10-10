import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { getServiceById, getVehicleById, updateServiceStatus } from "../../services/services";
import type { Service, Vehicle } from "../../types/database";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { formatTime } from "../../utils/format";
import type { DriverStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<DriverStackParamList, "PrepareService">;

const CHECKS = [
  { key: "vehicle", label: "Vehículo verificado" },
  { key: "docs", label: "Documentos al día" },
  { key: "fuel", label: "Combustible revisado" },
  { key: "route", label: "Ruta revisada" },
] as const;

export default function PrepareServiceScreen({ route, navigation }: Props) {
  const { serviceId } = route.params;
  const [service, setService] = useState<Service | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [mileage, setMileage] = useState("");
  const [fuelLevel, setFuelLevel] = useState(0.5);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const svc = await getServiceById(serviceId);
        setService(svc);
        const veh = await getVehicleById(svc.vehicle_id);
        setVehicle(veh);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el servicio.");
      } finally {
        setLoading(false);
      }
    })();
  }, [serviceId]);

  const allChecked = CHECKS.every((c) => checks[c.key]);

  const handleStart = async () => {
    if (!mileage.trim()) {
      Alert.alert("Ingresa el kilometraje inicial");
      return;
    }
    if (!allChecked) {
      Alert.alert("Completa la verificación obligatoria antes de iniciar la ruta.");
      return;
    }
    setSubmitting(true);
    try {
      const odometerKm = Number(mileage.replace(/\./g, "").replace(",", "."));
      await updateServiceStatus(serviceId, "en_ruta", {
        odometerKm: Number.isFinite(odometerKm) ? odometerKm : null,
      });
      navigation.replace("ActiveRoute", { serviceId });
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      Alert.alert("No se pudo iniciar la ruta", message ?? "Intenta nuevamente en unos segundos.");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScreenHeader title="Preparar Servicio" onBack={navigation.goBack} />
        <View style={styles.loading}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScreenHeader title="Preparar Servicio" onBack={navigation.goBack} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="Preparar Servicio" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>VEHÍCULO ASIGNADO</Text>
          <View style={styles.row}>
            <Text style={styles.vehicleName}>{vehicle ? `${vehicle.brand} ${vehicle.model}` : "-"}</Text>
            <View style={styles.timeTag}>
              <Text style={styles.timeTagText}>Inicio {service ? formatTime(service.scheduled_at) : "--:--"}</Text>
            </View>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>REGISTRO INICIAL</Text>
          <Text style={styles.label}>Kilometraje inicial</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 45000"
            placeholderTextColor={colors.textFaint}
            keyboardType="numeric"
            value={mileage}
            onChangeText={setMileage}
          />

          <Text style={[styles.label, styles.fuelLabel]}>
            Nivel de combustible · {Math.round(fuelLevel * 8)}/8
          </Text>
          <Slider
            minimumValue={0}
            maximumValue={1}
            value={fuelLevel}
            onValueChange={setFuelLevel}
            minimumTrackTintColor={colors.brand}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.brand}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>VERIFICACIÓN OBLIGATORIA</Text>
          {CHECKS.map((check) => (
            <Checkbox
              key={check.key}
              label={check.label}
              checked={!!checks[check.key]}
              onToggle={() => setChecks((prev) => ({ ...prev, [check.key]: !prev[check.key] }))}
            />
          ))}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Iniciar ruta" onPress={handleStart} loading={submitting} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  errorText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.textFaint },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vehicleName: { ...typography.h3, color: colors.text },
  timeTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  timeTagText: { ...typography.caption, color: colors.textMuted },
  label: { ...typography.captionStrong, color: colors.textMuted, marginTop: spacing.sm },
  fuelLabel: { marginTop: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    ...typography.body,
  },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
