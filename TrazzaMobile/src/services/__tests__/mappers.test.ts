import { mapLocation, mapProfile, mapService, mapServiceStop, mapVehicle } from "../mappers";
import type { DbProfile, DbServiceRow } from "../../types/database";

const baseProfile: DbProfile = {
  id: "u1",
  company_id: "c1",
  full_name: "Carlos Mendoza",
  email: "carlos@trazza.cl",
  phone: "+56922222222",
  role: "driver",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  drivers: [
    { id: "d-old", deleted_at: "2026-02-01T00:00:00Z" },
    { id: "d1", deleted_at: null },
  ],
  passengers: [],
};

const baseService: DbServiceRow = {
  id: "s1",
  service_code: "SRV-001",
  status: "in_progress",
  driver_id: "d1",
  vehicle_id: "v1",
  created_at: "2026-10-01T00:00:00Z",
  scheduled_at: "2026-10-09T11:30:00+00:00",
  eta: null,
  passenger_count: 12,
  route: {
    origin_name: "Planta Maipú",
    origin_address: "Av. Pajaritos 1234",
    origin_latitude: "-33.5100000",
    origin_longitude: -70.75,
    destination_name: "Mall Plaza Oeste",
    destination_address: "Av. Américo Vespucio 1501",
    destination_latitude: null,
    destination_longitude: null,
  },
  contract: { contract_name: null, client_name: "Minera Andes" },
};

describe("mapProfile", () => {
  it("traduce un conductor y toma su registro de drivers activo", () => {
    expect(mapProfile(baseProfile)).toMatchObject({
      role: "conductor",
      company_id: "c1",
      driver_id: "d1",
      passenger_id: null,
    });
  });

  it("traduce un pasajero", () => {
    const profile = mapProfile({
      ...baseProfile,
      role: "passenger",
      drivers: [],
      passengers: [{ id: "p1", deleted_at: null }],
    });
    expect(profile).toMatchObject({ role: "pasajero", driver_id: null, passenger_id: "p1" });
  });

  it("rechaza administradores", () => {
    expect(mapProfile({ ...baseProfile, role: "admin" })).toBeNull();
  });
});

describe("mapService", () => {
  it("toma origen y destino desde la ruta y convierte los numeric", () => {
    const service = mapService(baseService);
    expect(service).toMatchObject({
      code: "SRV-001",
      status: "en_ruta",
      contract_name: "Minera Andes",
      origin_label: "Planta Maipú",
      origin_latitude: -33.51,
      origin_longitude: -70.75,
      destination_latitude: null,
      passenger_count: 12,
    });
  });

  it.each([
    ["scheduled", "programado"],
    ["completed", "finalizado"],
    ["cancelled", "cancelado"],
  ] as const)("estado %s -> %s", (db, app) => {
    expect(mapService({ ...baseService, status: db }).status).toBe(app);
  });

  it("tolera servicios sin ruta", () => {
    expect(mapService({ ...baseService, route: null, contract: null })).toMatchObject({
      origin_label: "Origen",
      destination_address: "",
      contract_name: null,
    });
  });
});

describe("mapServiceStop", () => {
  it.each([
    ["pending", "pendiente"],
    ["next", "pendiente"],
    ["arrived", "confirmada"],
    ["completed", "completada"],
    ["skipped", "completada"],
  ] as const)("estado %s -> %s", (db, app) => {
    const stop = mapServiceStop({
      id: "st1",
      service_id: "s1",
      stop_order: 2,
      name: "Paradero 1",
      address: null,
      status: db,
      eta: null,
      passenger_count: null,
    });
    expect(stop).toMatchObject({ order_index: 2, label: "Paradero 1", address: "", status: app });
  });
});

it("mapVehicle usa capacity_passengers", () => {
  expect(
    mapVehicle({ id: "v1", plate: "ABCD12", brand: null, model: "Sprinter", capacity_passengers: 19 })
  ).toEqual({ id: "v1", plate: "ABCD12", brand: "", model: "Sprinter", capacity: 19 });
});

it("mapLocation convierte numeric y descarta filas sin coordenadas", () => {
  expect(
    mapLocation({
      service_id: "s1",
      latitude: "-33.45",
      longitude: "-70.66",
      heading: null,
      speed_kmh: "42.5",
      recorded_at: "2026-10-09T12:00:00Z",
    })
  ).toEqual({
    service_id: "s1",
    latitude: -33.45,
    longitude: -70.66,
    heading: null,
    speed: 42.5,
    updated_at: "2026-10-09T12:00:00Z",
  });
  expect(
    mapLocation({
      service_id: "s1",
      latitude: "",
      longitude: "-70.66",
      heading: null,
      speed_kmh: null,
      recorded_at: "2026-10-09T12:00:00Z",
    })
  ).toBeNull();
});
