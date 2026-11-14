// Traduce errores de Supabase/Postgres/red a mensajes para personas.
// Las pantallas nunca deben mostrar `error.message` crudo.

type ErrorLike = { code?: string; message?: string; status?: number; name?: string };

export const DEFAULT_ERROR = "Algo salió mal. Intenta nuevamente en unos segundos.";
export const OFFLINE_ERROR = "Sin conexión. Revisa tu señal o Wi-Fi e intenta de nuevo.";

export function isNetworkError(error: unknown) {
  const message = (error as ErrorLike | null)?.message ?? "";
  return /network request failed|failed to fetch|network ?error|load failed|timeout/i.test(message);
}

/** Motivo del error en lenguaje claro. */
export function friendlyError(error: unknown): string {
  if (!error) return DEFAULT_ERROR;
  if (error instanceof AppError) return error.message;
  const err = (typeof error === "object" ? error : { message: String(error) }) as ErrorLike;
  const message = err.message ?? "";

  if (isNetworkError(err)) return OFFLINE_ERROR;

  // Auth
  if (/invalid login credentials/i.test(message)) {
    return "Credenciales inválidas. Verifica tus datos e intenta de nuevo.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Tu cuenta aún no está activada. Pide al administrador de tu empresa que la confirme.";
  }
  if (/too many requests|rate limit/i.test(message) || err.status === 429) {
    return "Demasiados intentos seguidos. Espera un minuto e intenta otra vez.";
  }
  if (err.code === "PGRST301" || err.status === 401 || /jwt (expired|malformed)|invalid jwt|refresh token/i.test(message)) {
    return "Tu sesión expiró por seguridad. Vuelve a iniciar sesión.";
  }
  if (err.code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "No tienes permiso para ver esto. Si crees que es un error, contacta al administrador.";
  }

  // Mensajes de las funciones mobile_* de la base: ya están escritos para personas.
  if (err.code === "P0001" && message) return message;

  if (err.code === "PGRST116") return "Este viaje ya no está disponible. Puede que lo hayan cancelado o reasignado.";

  return DEFAULT_ERROR;
}

/** Error con un mensaje ya pensado para mostrarse tal cual al usuario. */
export class AppError extends Error {}
