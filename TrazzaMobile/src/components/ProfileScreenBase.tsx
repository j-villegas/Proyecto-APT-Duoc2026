import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing, typography } from "../constants/theme";

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}

export function ProfileScreenBase({ items, roleLabel }: { items: MenuItem[]; roleLabel: string }) {
  const { profile, session, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Perfil</Text>

        <Card style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={28} color={colors.textMuted} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.name}>{profile?.full_name ?? "Usuario"}</Text>
            <Text style={styles.role}>{roleLabel}</Text>
            {session?.user.email ? (
              <Text style={styles.role}>{session.user.email}</Text>
            ) : null}
          </View>
        </Card>

        <Card padded={false} style={styles.menuCard}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, index < items.length - 1 && styles.menuItemBorder]}
              onPress={item.onPress}
            >
              <Ionicons name={item.icon} size={20} color={colors.textMuted} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          ))}
        </Card>

        <TouchableOpacity style={styles.logout} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutLabel}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  title: { ...typography.h1, color: colors.text },
  profileCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  flex1: { flex: 1 },
  name: { ...typography.h3, color: colors.text },
  role: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  menuCard: { overflow: "hidden" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuLabel: { ...typography.body, color: colors.text, flex: 1 },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerMuted,
  },
  logoutLabel: { ...typography.bodyStrong, color: colors.danger },
});
