import { AppError, DEFAULT_ERROR, OFFLINE_ERROR, friendlyError } from "../errors";

describe("friendlyError", () => {
  it.each([
    [{ message: "Network request failed" }, OFFLINE_ERROR],
    [new TypeError("Failed to fetch"), OFFLINE_ERROR],
    [{ message: "Invalid login credentials" }, "Credenciales inválidas. Verifica tus datos e intenta de nuevo."],
    [{ message: "JWT expired", code: "PGRST301" }, "Tu sesión expiró por seguridad. Vuelve a iniciar sesión."],
    [{ code: "42501", message: "new row violates row-level security policy" }, "No tienes permiso para ver esto. Si crees que es un error, contacta al administrador."],
    [{ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, "Este viaje ya no está disponible. Puede que lo hayan cancelado o reasignado."],
  ])("traduce %j", (error, expected) => {
    expect(friendlyError(error)).toBe(expected);
  });

  it("deja pasar los mensajes escritos para personas en las funciones de la base", () => {
    expect(friendlyError({ code: "P0001", message: "El servicio no está asignado a este conductor." })).toBe(
      "El servicio no está asignado a este conductor."
    );
  });

  it("deja pasar los AppError", () => {
    expect(friendlyError(new AppError("Este servicio aún no tiene vehículo asignado."))).toBe(
      "Este servicio aún no tiene vehículo asignado."
    );
  });

  it("nunca muestra mensajes técnicos desconocidos", () => {
    expect(friendlyError({ code: "XX000", message: 'duplicate key value violates unique constraint "x"' })).toBe(DEFAULT_ERROR);
    expect(friendlyError(new Error("Cannot read properties of undefined"))).toBe(DEFAULT_ERROR);
    expect(friendlyError(null)).toBe(DEFAULT_ERROR);
  });
});
