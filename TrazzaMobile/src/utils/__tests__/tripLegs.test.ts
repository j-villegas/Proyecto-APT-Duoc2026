import type { DbServiceRow, Service, ServiceStop } from "../../types/database";
import { mapService } from "../../services/mappers";
import { regionFollowing, STREET_LEVEL_DELTA } from "../geo";
import { passengerLegs, passengerPhase, stopActionLabel, stopArriveButton, stopsBefore } from "../tripLegs";
import { buildPassengerTripSteps } from "../serviceStatus";

const stop = (id: string, order: number, type: ServiceStop["type"], label: string, extra: Partial<ServiceStop> = {}): ServiceStop => ({
  id, service_id: "s1", order_index: order, type, label, address: `${label} 123`, eta: null,
  passenger_count: 1, status: "pendiente", arrived_at: null, completed_at: null, ...extra,
});

const stops = [
  stop("o", 1, "origin", "Base", { status: "completada", completed_at: "2026-10-10T11:00:00Z" }),
  stop("p1", 2, "pickup", "Otra Persona"),
  stop("p2", 3, "pickup", "Ana Rojas"),
  stop("d2", 4, "dropoff", "Ana Rojas"),
  stop("dest", 5, "destination", "Planta"),
];

const service = { status: "en_ruta", scheduled_at: "2026-10-10T11:00:00Z", actual_start_at: "2026-10-10T11:00:00Z", actual_end_at: null } as Service;

describe("tramos del pasajero", () => {
  it("usa su recogida y su bajada, no el origen de la ruta", () => {
    const legs = passengerLegs(stops, { pickupStopId: "p2", dropoffStopId: "d2" });
    expect([legs.origin?.id, legs.pickup?.id, legs.dropoff?.id]).toEqual(["o", "p2", "d2"]);
  });

  it("sin bajada propia, baja en el destino final", () => {
    expect(passengerLegs(stops, { pickupStopId: "p1", dropoffStopId: null }).dropoff?.id).toBe("dest");
  });

  it("fase: el conductor viene, a bordo y llegada", () => {
    const legs = passengerLegs(stops, { pickupStopId: "p2", dropoffStopId: "d2" });
    expect(passengerPhase(service, legs)).toBe("coming");
    expect(stopsBefore(stops, legs.pickup)).toBe(1);
    const boarded = passengerLegs(
      stops.map((s) => (s.id === "p2" ? { ...s, status: "completada" as const } : s)),
      { pickupStopId: "p2", dropoffStopId: "d2" }
    );
    expect(passengerPhase(service, boarded)).toBe("onboard");
    expect(passengerPhase({ ...service, status: "finalizado" }, boarded)).toBe("arrived");
  });

  it("los pasos del pasajero no muestran a otros pasajeros", () => {
    const legs = passengerLegs(stops, { pickupStopId: "p2", dropoffStopId: "d2" });
    const labels = buildPassengerTripSteps(service, legs).map((s) => s.label);
    expect(labels).toEqual([
      "Viaje programado",
      "El conductor salió desde Base",
      "Te recoge en Ana Rojas 123",
      "Te deja en Ana Rojas 123",
      "Viaje finalizado",
    ]);
    expect(labels.join(" ")).not.toContain("Otra Persona");
  });

  it("texto de cada parada para el conductor", () => {
    expect(stops.map(stopActionLabel)).toEqual([
      "Salida", "Recoger a Otra Persona", "Recoger a Ana Rojas", "Dejar a Ana Rojas", "Destino · Planta",
    ]);
  });
});

describe("encuadre del conductor con su próximo punto", () => {
  const driver = { latitude: -23.654, longitude: -70.3945 };
  const pickup = { latitude: -23.6464, longitude: -70.398 };

  it("incluye al conductor y al punto, sobre las tarjetas de abajo", () => {
    const r = regionFollowing(driver, pickup);
    const top = r.latitude + r.latitudeDelta / 2;
    const bottom = r.latitude - r.latitudeDelta / 2;
    for (const p of [driver, pickup]) {
      expect(p.latitude).toBeLessThan(top);
      // Ambos puntos en el 60 % superior del mapa.
      expect(p.latitude).toBeGreaterThan(bottom + r.latitudeDelta * 0.4);
      expect(Math.abs(p.longitude - r.longitude)).toBeLessThan(r.longitudeDelta / 2);
    }
  });

  it("nunca se aleja menos que el nivel de calle", () => {
    const r = regionFollowing(driver, { latitude: -23.6541, longitude: -70.3946 });
    expect(r.longitudeDelta).toBe(STREET_LEVEL_DELTA);
  });
});

describe("ruta planificada", () => {
  it("convierte [[lat, lng]] en coordenadas", () => {
    const svc = mapService({ id: "s1", service_code: "R", status: "scheduled", route: null, contract: null,
      planned_path: [[-23.65, -70.39], [-23.64, -70.4]] } as unknown as DbServiceRow);
    expect(svc.planned_path).toEqual([{ latitude: -23.65, longitude: -70.39 }, { latitude: -23.64, longitude: -70.4 }]);
  });
});

describe("cuadrilla con regreso a la base", () => {
  const crew = [
    stop("o", 1, "origin", "Base", { status: "completada" }),
    stop("p1", 2, "pickup", "Pedro Soto"),
    stop("p2", 3, "pickup", "Camila Díaz"),
    stop("p3", 4, "pickup", "Ana Rojas"),
    stop("dest", 5, "destination", "Puerto"),
    stop("r", 6, "return", "Base"),
  ];

  it("todos bajan en el destino común y el regreso no cuenta como parada del pasajero", () => {
    const legs = passengerLegs(crew, { pickupStopId: "p3", dropoffStopId: null });
    expect(legs.dropoff?.id).toBe("dest");
    expect(stopsBefore(crew, legs.pickup)).toBe(2);
    expect(stopsBefore(crew, legs.dropoff)).toBe(3);
  });

  it("el conductor ve el regreso a la base al final", () => {
    expect(stopActionLabel(crew[5])).toBe("Regreso a la base · Base");
    expect(stopArriveButton(crew[5])).toBe("Llegué a la base");
  });
});
