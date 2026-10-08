import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { TripRouteMap } from "../TripRouteMap";
import { clearGeocodeCache, regionForPoints } from "../../utils/geo";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  geocodeAsync: jest.fn(),
}));

const origin = { label: "Los Jardines 65", address: "Los Jardines 65, Las Condes" };
const destination = { label: "FALP", address: "Av. Apoquindo 4501, Las Condes" };

beforeEach(() => {
  clearGeocodeCache();
  jest.mocked(Location.geocodeAsync).mockReset();
});

it("usa las coordenadas guardadas sin geocodificar", async () => {
  await render(
    <TripRouteMap
      origin={{ ...origin, latitude: -33.41, longitude: -70.58 }}
      destination={{ ...destination, latitude: -33.42, longitude: -70.6 }}
    />
  );

  expect(await screen.findByTestId("trip-route-map")).toBeTruthy();
  expect(Location.geocodeAsync).not.toHaveBeenCalled();
});

it("geocodifica la dirección cuando el servicio no tiene coordenadas", async () => {
  jest
    .mocked(Location.geocodeAsync)
    .mockResolvedValue([{ latitude: -33.41, longitude: -70.58, accuracy: 1 } as never]);

  await render(<TripRouteMap origin={origin} destination={destination} />);

  expect(await screen.findByTestId("trip-route-map")).toBeTruthy();
  expect(Location.geocodeAsync).toHaveBeenCalledWith("Los Jardines 65, Las Condes, Chile");
});

it("si no logra ubicar la dirección ofrece abrirla en Google Maps", async () => {
  jest.mocked(Location.geocodeAsync).mockResolvedValue([]);

  await render(<TripRouteMap origin={origin} destination={destination} />);

  expect(await screen.findByText("No pudimos ubicar la dirección en el mapa.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Abrir en Google Maps"));
  expect(Linking.openURL).toHaveBeenCalledWith(
    "https://www.google.com/maps/search/?api=1&query=Los%20Jardines%2065%2C%20Las%20Condes"
  );
});

it("regionForPoints encuadra ambos puntos con margen", () => {
  const region = regionForPoints([
    { latitude: -33.4, longitude: -70.6 },
    { latitude: -33.5, longitude: -70.5 },
  ]);
  expect(region.latitude).toBeCloseTo(-33.45);
  expect(region.longitude).toBeCloseTo(-70.55);
  expect(region.latitudeDelta).toBeCloseTo(0.16);
});
