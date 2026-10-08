import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { PROVIDER_GOOGLE } from "react-native-maps";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Expo Go en iOS no trae el SDK nativo de Google Maps: forzar PROVIDER_GOOGLE
// ahí deja el mapa en blanco. En un development/production build (con la API
// key de Google Maps compilada vía app.config.ts) sí está disponible.
export const mapProvider = Platform.OS === "ios" && isExpoGo ? undefined : PROVIDER_GOOGLE;

// Apple Maps (el fallback en Expo Go/iOS) ignora `customMapStyle`, así que el
// estilo oscuro de marca solo aplica cuando mapProvider === PROVIDER_GOOGLE.
export const supportsCustomMapStyle = mapProvider === PROVIDER_GOOGLE;
