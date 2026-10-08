import type { ExpoConfig } from "expo/config";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

const config: ExpoConfig = {
  name: "TRAZZA",
  slug: "trazza-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  scheme: "trazza",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.trazza.mobile",
    config: {
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "TRAZZA necesita tu ubicación para mostrar el mapa y calcular tiempos de llegada.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "TRAZZA necesita tu ubicación en segundo plano para transmitir la ruta del conductor en tiempo real.",
    },
  },
  android: {
    package: "com.trazza.mobile",
    adaptiveIcon: {
      backgroundColor: "#0B1D3A",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    config: {
      googleMaps: {
        apiKey: GOOGLE_MAPS_API_KEY,
      },
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-secure-store",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "TRAZZA necesita tu ubicación para transmitir la ruta en tiempo real mientras conduces.",
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  },
};

export default config;
