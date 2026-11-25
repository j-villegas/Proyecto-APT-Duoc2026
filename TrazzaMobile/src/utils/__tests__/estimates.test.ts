import { haversineKm, pathLengthKm, positionAlongPath } from "../estimates";

const santiago = { latitude: -33.45, longitude: -70.66 };
const providencia = { latitude: -33.42, longitude: -70.61 };

describe("positionAlongPath", () => {
  const path = [santiago, { latitude: -33.45, longitude: -70.6 }, providencia];

  it("parte en el origen y termina en el destino", () => {
    expect(positionAlongPath(path, 0)).toMatchObject(santiago);
    expect(positionAlongPath(path, 1)).toMatchObject(providencia);
  });

  it("a la mitad del recorrido está sobre el trayecto", () => {
    const mid = positionAlongPath(path, 0.5)!;
    expect(mid.latitude).toBeLessThanOrEqual(-33.42);
    expect(mid.latitude).toBeGreaterThanOrEqual(-33.45);
    expect(pathLengthKm(path)).toBeGreaterThan(haversineKm(santiago, providencia));
  });

  it("sin puntos no hay posición", () => {
    expect(positionAlongPath([], 0.5)).toBeNull();
  });
});
