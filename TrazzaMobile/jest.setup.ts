/* eslint-disable @typescript-eslint/no-require-imports */
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

jest.mock("expo-linking", () => ({
  createURL: jest.fn((path: string) => `trazza://${path}`),
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  openURL: jest.fn().mockResolvedValue(true),
}));

jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Mock = (props: object) => React.createElement(View, props);
  return { __esModule: true, default: Mock, Marker: Mock, Polyline: Mock, PROVIDER_GOOGLE: "google" };
});
