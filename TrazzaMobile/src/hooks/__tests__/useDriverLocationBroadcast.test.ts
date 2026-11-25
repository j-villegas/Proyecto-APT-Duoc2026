import { act, renderHook } from "@testing-library/react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import {
  LOCATION_REPORT_INTERVAL_MS,
  SIMULATION_REPORT_INTERVAL_MS,
  useDriverLocationBroadcast,
} from "../useDriverLocationBroadcast";

jest.mock("../../lib/supabase", () => ({ supabase: { rpc: jest.fn() } }));
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

const remove = jest.fn();
let emit: (location: Location.LocationObject) => void;
// Se capturan los intervalos del hook para dispararlos a mano (los timers
// falsos de Jest interfieren con act() de React 19).
let intervals: { fn: () => void; ms: number }[];

const fix = {
  coords: { latitude: -23.65, longitude: -70.4, heading: 90, speed: 10, accuracy: 5, altitude: null, altitudeAccuracy: null },
  timestamp: 0,
} as Location.LocationObject;

/** Deja correr las promesas pendientes (permiso, watch, rpc). */
const flush = () => act(async () => {});
const tick = () => act(async () => intervals.forEach((i) => i.fn()));

beforeEach(() => {
  jest.clearAllMocks();
  intervals = [];
  jest.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, ms: number) => {
    intervals.push({ fn, ms });
    return intervals.length as never;
  }) as never);
  jest.spyOn(globalThis, "clearInterval").mockImplementation(() => {
    intervals = [];
  });
  jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
  jest.mocked(Location.watchPositionAsync).mockImplementation(async (_opts, cb) => {
    emit = cb;
    return { remove } as never;
  });
});

afterEach(() => {
  jest.mocked(globalThis.setInterval).mockRestore();
  jest.mocked(globalThis.clearInterval).mockRestore();
});

const mount = async (enabled: boolean) => {
  const hook = await renderHook(() => useDriverLocationBroadcast({ serviceId: "s1", enabled }));
  await flush();
  return hook;
};

it("envía la primera posición al tiro y luego una cada 30 s, aunque el vehículo no se mueva", async () => {
  const { unmount } = await mount(true);
  await act(async () => emit(fix));
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
  expect(supabase.rpc).toHaveBeenCalledWith("mobile_report_location", expect.objectContaining({
    p_service_id: "s1", p_latitude: -23.65, p_speed_kmh: 36,
  }));

  expect(intervals.map((i) => i.ms)).toEqual([LOCATION_REPORT_INTERVAL_MS]);
  expect(LOCATION_REPORT_INTERVAL_MS).toBe(30_000);
  await tick();
  await tick();
  expect(supabase.rpc).toHaveBeenCalledTimes(3);

  await unmount();
  expect(remove).toHaveBeenCalled();
});

it("se apaga sola cuando la base responde que el servicio ya no está en curso", async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ error: { message: "El servicio ya no está en curso." } } as never);
  const { result, unmount } = await mount(true);
  await act(async () => emit(fix));
  await flush();

  expect(remove).toHaveBeenCalled();
  expect(intervals).toHaveLength(0);
  expect(result.current.error).toBeNull();
  await unmount();
});

it("sin permiso de ubicación avisa y no transmite", async () => {
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
  const { result, unmount } = await mount(true);
  expect(result.current.error).toMatch(/Activa tu ubicación/);
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  await unmount();
});

it("deshabilitado no pide la ubicación", async () => {
  const { unmount } = await mount(false);
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  await unmount();
});

it("modo demostración: recorre las paradas sin GPS y marca los pings como simulados", async () => {
  const path = [
    { latitude: -33.45, longitude: -70.66 },
    { latitude: -33.42, longitude: -70.61 },
  ];
  const { result, unmount } = await renderHook(() =>
    useDriverLocationBroadcast({ serviceId: "s1", enabled: true, simulatePath: path })
  );
  await flush();

  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(supabase.rpc).toHaveBeenCalledWith("mobile_report_location", expect.objectContaining({
    p_service_id: "s1", p_latitude: -33.45, p_longitude: -70.66, p_is_simulated: true,
  }));
  expect(intervals.map((i) => i.ms)).toEqual([SIMULATION_REPORT_INTERVAL_MS]);
  expect(result.current.simulatedPosition).toEqual(path[0]);
  await tick();
  expect(supabase.rpc).toHaveBeenCalledTimes(2);
  await unmount();
});
