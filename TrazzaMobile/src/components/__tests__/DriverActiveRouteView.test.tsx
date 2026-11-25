import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DriverActiveRouteView } from "../DriverActiveRouteView";
import { getServiceById, getServiceStops, updateServiceStatus } from "../../services/services";
import { useDriverLocationBroadcast } from "../../hooks/useDriverLocationBroadcast";
import type { Service, ServiceStop } from "../../types/database";

jest.mock("../../services/services", () => ({
  getServiceById: jest.fn(),
  getServiceStops: jest.fn(),
  updateServiceStatus: jest.fn().mockResolvedValue(undefined),
  updateStopStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../hooks/useDriverLocationBroadcast", () => ({
  useDriverLocationBroadcast: jest.fn(() => ({ error: null })),
}));
// Realtime no conecta en las pruebas: los datos vienen de los mocks de services.
jest.mock("../../lib/realtime", () => ({ authenticateRealtime: () => new Promise(() => {}) }));
jest.mock("../../lib/supabase", () => ({ supabase: { removeChannel: jest.fn() } }));
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ profile: { id: "u1" } }) }));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  getCurrentPositionAsync: jest.fn(),
}));

const service = (status: Service["status"]): Service => ({
  id: "s1", code: "ANT-001", contract_name: null, driver_id: "d1", vehicle_id: "v1",
  origin_label: "Origen", origin_address: "", destination_label: "Destino", destination_address: "",
  scheduled_at: "2026-10-10T01:30:00Z", eta: null, status, passenger_count: 1,
  actual_start_at: null, actual_end_at: null, cancel_reason: null, created_at: "2026-10-09T00:00:00Z",
});
const stop = (status: ServiceStop["status"]): ServiceStop => ({
  id: "st1", service_id: "s1", order_index: 1, type: "pickup", label: "Paradero", address: "", eta: null,
  passenger_count: 1, status, arrived_at: null, completed_at: null,
});

it("una ruta finalizada no ofrece más acciones y permite salir", async () => {
  jest.mocked(getServiceById).mockResolvedValue(service("finalizado"));
  jest.mocked(getServiceStops).mockResolvedValue([stop("completada")]);
  const onExit = jest.fn();
  await render(<DriverActiveRouteView serviceId="s1" onReportIncident={jest.fn()} onExit={onExit} />);

  expect(await screen.findByText("Ruta finalizada")).toBeTruthy();
  expect(screen.queryByText("Pasajero a bordo")).toBeNull();
  expect(screen.queryByText("Finalizar ruta")).toBeNull();
  await fireEvent.press(screen.getByText("Volver al inicio"));
  expect(onExit).toHaveBeenCalled();
});

it("con todas las paradas completas ofrece finalizar la ruta", async () => {
  jest.mocked(getServiceById).mockResolvedValue(service("en_ruta"));
  jest.mocked(getServiceStops).mockResolvedValue([stop("completada")]);
  await render(<DriverActiveRouteView serviceId="s1" onReportIncident={jest.fn()} />);

  const finish = await screen.findByText("Finalizar ruta");
  jest.mocked(getServiceById).mockResolvedValue(service("finalizado"));
  await fireEvent.press(finish);
  expect(updateServiceStatus).toHaveBeenCalledWith("s1", "finalizado");
  expect(await screen.findByText("Ruta finalizada")).toBeTruthy();
});

it("transmite el GPS solo mientras la ruta está en curso", async () => {
  jest.mocked(getServiceById).mockResolvedValue(service("cancelado"));
  jest.mocked(getServiceStops).mockResolvedValue([stop("pendiente")]);
  await render(<DriverActiveRouteView serviceId="s1" onReportIncident={jest.fn()} />);

  expect(await screen.findByText("Ruta cancelada")).toBeTruthy();
  expect(screen.queryByText("Pasajero a bordo")).toBeNull();
  expect(jest.mocked(useDriverLocationBroadcast)).toHaveBeenLastCalledWith(expect.objectContaining({ serviceId: "s1", enabled: false }));
});
