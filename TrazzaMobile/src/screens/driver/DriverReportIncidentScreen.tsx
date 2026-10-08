import React, { useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import { createIncident, uploadIncidentPhoto } from "../../services/incidents";
import type { IncidentPriority, IncidentType } from "../../types/database";
import { colors, radius, spacing, typography } from "../../constants/theme";
import type { DriverStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<DriverStackParamList, "DriverReportIncident">;

const CATEGORIES: { key: IncidentType; label: string }[] = [
  { key: "vehiculo", label: "Vehículo" },
  { key: "pasajero", label: "Pasajero" },
  { key: "ruta", label: "Ruta" },
  { key: "otro", label: "Otro" },
];

const PRIORITIES: { key: IncidentPriority; label: string }[] = [
  { key: "baja", label: "Baja" },
  { key: "media", label: "Media" },
  { key: "alta", label: "Alta" },
];

export default function DriverReportIncidentScreen({ route, navigation }: Props) {
  const { serviceId } = route.params;
  const { profile } = useAuth();

  const [category, setCategory] = useState<IncidentType>("vehiculo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IncidentPriority>("media");
  const [photos, setPhotos] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const position = await Location.getCurrentPositionAsync({});
    setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
  };

  const addPhoto = async () => {
    if (photos.length >= 3) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Completa el título y la descripción de la incidencia.");
      return;
    }
    if (!profile) return;

    setSubmitting(true);
    try {
      const photoUrls = await Promise.all(
        photos.map((uri) => uploadIncidentPhoto(uri, profile.id))
      );
      await createIncident({
        serviceId: serviceId ?? null,
        reporterId: profile.id,
        category,
        title,
        description,
        priority,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        photoUrls,
      });
      Alert.alert("Incidencia enviada", "El reporte fue registrado correctamente.", [
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
      <ScreenHeader title="Reportar Incidencia" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>DETALLES DE LA INCIDENCIA</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((item) => {
            const active = category === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setCategory(item.key)}
              >
                <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Título breve</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Falla mecánica en Ruta 4"
          placeholderTextColor={colors.textFaint}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Descripción detallada</Text>
        <TextInput
          style={styles.textarea}
          placeholder="Describa el problema, acciones tomadas y estado actual..."
          placeholderTextColor={colors.textFaint}
          multiline
          numberOfLines={5}
          value={description}
          onChangeText={setDescription}
        />

        <Text style={styles.sectionTitle}>EVIDENCIA Y UBICACIÓN</Text>
        <Card style={styles.card}>
          <Text style={styles.label}>Fotografías (máx. 3)</Text>
          <View style={styles.photoRow}>
            {photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.photoThumb} />
            ))}
            {photos.length < 3 ? (
              <TouchableOpacity style={styles.photoAdd} onPress={addPhoto}>
                <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={18} color={colors.brand} />
            <Text style={styles.locationText}>
              {coords
                ? `Lat: ${coords.latitude.toFixed(4)}, Lng: ${coords.longitude.toFixed(4)}`
                : "Ubicación no registrada"}
            </Text>
            <TouchableOpacity onPress={updateLocation}>
              <Text style={styles.updateLink}>Actualizar</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>PRIORIDAD DE ATENCIÓN</Text>
        <View style={styles.categoryRow}>
          {PRIORITIES.map((item) => {
            const active = priority === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.priorityChip, active && styles.priorityChipActive]}
                onPress={() => setPriority(item.key)}
              >
                <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Enviar incidencia" onPress={handleSubmit} loading={submitting} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  sectionTitle: { ...typography.label, color: colors.textFaint, marginTop: spacing.md },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  categoryChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  priorityChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  categoryLabel: { ...typography.captionStrong, color: colors.textMuted },
  categoryLabelActive: { color: colors.background },
  label: { ...typography.captionStrong, color: colors.textMuted, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    ...typography.body,
  },
  textarea: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    minHeight: 110,
    textAlignVertical: "top",
    ...typography.body,
  },
  card: { gap: spacing.md },
  photoRow: { flexDirection: "row", gap: spacing.sm },
  photoThumb: { width: 64, height: 64, borderRadius: radius.md },
  photoAdd: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  locationText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  updateLink: { ...typography.captionStrong, color: colors.brand },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
