export const colors = {
  background: "#0B1D3A",
  backgroundAlt: "#0C2340",
  surface: "#112233",
  surfaceAlt: "#162D4A",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.16)",

  brand: "#10B981",
  brandAlt: "#00C88C",
  brandMuted: "rgba(16, 185, 129, 0.16)",

  text: "#FFFFFF",
  textMuted: "rgba(255, 255, 255, 0.64)",
  textFaint: "rgba(255, 255, 255, 0.4)",

  warning: "#F59E0B",
  warningMuted: "rgba(245, 158, 11, 0.16)",
  danger: "#EF4444",
  dangerMuted: "rgba(239, 68, 68, 0.16)",
  info: "#3B82F6",
  infoMuted: "rgba(59, 130, 246, 0.16)",

  white: "#FFFFFF",
  black: "#000000",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: "700" as const },
  h2: { fontSize: 22, fontWeight: "700" as const },
  h3: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, fontWeight: "600" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  captionStrong: { fontSize: 13, fontWeight: "600" as const },
  label: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.6 },
};

export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
};
