import { noticeForTransition } from "../useServiceStatusNotice";
import { mapService } from "../../services/mappers";
import type { DbServiceRow, Service } from "../../types/database";

// Viaje asignado por la central al conductor "d1" con el vehículo "v1".
const row: DbServiceRow = {
  id: "s1",
  service_code: "R-010",
  status: "scheduled",
  driver_id: "d1",
  vehicle_id: "v1",
  created_at: "2026-11-19T20:00:00Z",
  scheduled_at: "2026-11-19T21:00:00Z",
  eta: null,
  passenger_count: 3,
  actual_start_at: null,
  actual_end_at: null,
  cancel_reason: null,
  route: {
    origin_name: "Plaza Colón",
    origin_address: null,
    origin_latitude: "-23.6466",
    origin_longitude: -70.3979,
    destination_name: "Mall Plaza",
    destination_address: null,
    destination_latitude: -23.6338,
    destination_longitude: -70.3963,
  },
  contract: null,
};

const scheduled = mapService(row);
const with_ = (patch: Partial<Service>): Service => ({ ...scheduled, ...patch });

describe("noticeForTransition", () => {
  it("avisa cuando el conductor inicia el viaje asignado", () => {
    expect(noticeForTransition(scheduled, with_({ status: "en_ruta" }))?.title).toBe("Tu conductor inició el viaje");
  });

  it("avisa el fin del viaje", () => {
    const started = with_({ status: "en_ruta" });
    expect(noticeForTransition(started, with_({ status: "finalizado" }))?.key).toBe("finished");
  });

  it("avisa la cancelación con el motivo", () => {
    expect(noticeForTransition(scheduled, with_({ status: "cancelado", cancel_reason: "Sin conductores" }))?.message)
      .toBe("Sin conductores");
  });

  it("sin cambios de estado no hay aviso", () => {
    expect(noticeForTransition(scheduled, with_({ passenger_count: 4 }))).toBeNull();
  });
});
