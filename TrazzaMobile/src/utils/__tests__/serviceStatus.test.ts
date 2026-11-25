import { buildServiceTimeline, buildTripSteps, driverActionFor, isClosed } from "../serviceStatus";
import type { Service, ServiceStop } from "../../types/database";

const service: Service = {
  id: "s1",
  code: "ANT-001",
  contract_name: null,
  driver_id: "d1",
  vehicle_id: "v1",
  origin_label: "Duoc UC: sede Maipú",
  origin_address: "",
  destination_label: "Francisco Pizarro 2349",
  destination_address: "",
  scheduled_at: "2026-10-10T01:30:00Z",
  eta: null,
  status: "finalizado",
  passenger_count: 1,
  actual_start_at: "2026-10-10T01:32:00Z",
  actual_end_at: "2026-10-10T02:05:00Z",
  cancel_reason: null,
  created_at: "2026-10-09T00:00:00Z",
};

const stop = (id: string, order: number, completed: string | null, arrived: string | null = null): ServiceStop => ({
  id,
  service_id: "s1",
  order_index: order,
  type: "pickup",
  label: `Parada ${order}`,
  address: "",
  eta: null,
  passenger_count: 0,
  status: completed ? "completada" : "pendiente",
  arrived_at: arrived,
  completed_at: completed,
});

describe("driverActionFor", () => {
  it.each([
    ["programado", "prepare", "Preparar ruta"],
    ["en_ruta", "continue", "Continuar ruta"],
    ["finalizado", "view", "Ver detalle"],
    ["cancelado", "view", "Ver detalle"],
  ] as const)("%s -> %s", (status, kind, label) => {
    expect(driverActionFor(status)).toEqual({ kind, label });
  });

  it("solo finalizado y cancelado están cerrados", () => {
    expect(isClosed("finalizado")).toBe(true);
    expect(isClosed("cancelado")).toBe(true);
    expect(isClosed("programado")).toBe(false);
    expect(isClosed("en_ruta")).toBe(false);
  });
});

describe("buildServiceTimeline", () => {
  it("lista programación, inicio, paradas en orden y término", () => {
    const timeline = buildServiceTimeline(service, [
      stop("b", 2, "2026-10-10T02:00:00Z"),
      stop("a", 1, "2026-10-10T01:45:00Z"),
      stop("c", 3, null),
    ]);
    expect(timeline.map((e) => [e.label, e.detail ?? null, e.at])).toEqual([
      ["Programado", null, "2026-10-10T01:30:00Z"],
      ["Inicio de ruta", null, "2026-10-10T01:32:00Z"],
      ["Parada completada", "Parada 1", "2026-10-10T01:45:00Z"],
      ["Parada completada", "Parada 2", "2026-10-10T02:00:00Z"],
      ["Servicio finalizado", null, "2026-10-10T02:05:00Z"],
    ]);
  });

  it("muestra la cancelación con su motivo", () => {
    const timeline = buildServiceTimeline(
      { ...service, status: "cancelado", actual_start_at: null, cancel_reason: "Bus en panne" },
      []
    );
    expect(timeline.at(-1)).toMatchObject({ label: "Servicio cancelado", detail: "Bus en panne", tone: "danger" });
    expect(timeline).toHaveLength(2);
  });

  it("un servicio programado solo tiene la programación", () => {
    expect(buildServiceTimeline({ ...service, status: "programado", actual_start_at: null, actual_end_at: null }, [])).toHaveLength(1);
  });
});

describe("buildTripSteps", () => {
  const states = (steps: ReturnType<typeof buildTripSteps>) => steps.map((s) => [s.label, s.state]);

  it("un viaje programado espera el inicio, sin pasos inventados", () => {
    const steps = buildTripSteps(
      { ...service, status: "programado", actual_start_at: null, actual_end_at: null },
      [stop("a", 1, null)]
    );
    expect(states(steps)).toEqual([
      ["Servicio programado", "done"],
      ["El conductor inició la ruta", "active"],
      ["Parada 1", "pending"],
      ["Viaje finalizado", "pending"],
    ]);
  });

  it("en ruta marca como activa la próxima parada con su hora real", () => {
    const steps = buildTripSteps({ ...service, status: "en_ruta", actual_end_at: null }, [
      stop("a", 1, "2026-10-10T01:45:00Z"),
      stop("b", 2, null),
    ]);
    expect(states(steps)).toEqual([
      ["Servicio programado", "done"],
      ["El conductor inició la ruta", "done"],
      ["Parada 1", "done"],
      ["Parada 2", "active"],
      ["Viaje finalizado", "pending"],
    ]);
    expect(steps[2].time).toBe("2026-10-10T01:45:00Z");
  });

  it("un viaje cancelado no deja pasos en curso", () => {
    const steps = buildTripSteps({ ...service, status: "cancelado", actual_start_at: null }, [stop("a", 1, null)]);
    expect(steps.some((s) => s.state === "active")).toBe(false);
    expect(steps.at(-1)).toMatchObject({ label: "Viaje cancelado", state: "done" });
  });
});

describe("daysUntil", () => {
  const { daysUntil } = jest.requireActual("../format") as typeof import("../format");
  const today = new Date(2026, 9, 9, 22, 30); // 9 oct 2026, de noche

  it("cuenta días calendario, sin importar la hora", () => {
    expect(daysUntil("2026-10-09", today)).toBe(0);
    expect(daysUntil("2026-10-10", today)).toBe(1);
    expect(daysUntil("2026-06-04", today)).toBeLessThan(0);
  });
});
