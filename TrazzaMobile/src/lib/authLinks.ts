import * as Linking from "expo-linking";

export const PASSWORD_RESET_PATH = "reset-password";

/** URL a la que Supabase redirige desde el correo de recuperación (ej: trazza://reset-password). */
export function getPasswordResetRedirectUrl() {
  return Linking.createURL(PASSWORD_RESET_PATH);
}

export type AuthRedirect =
  | { type: "tokens"; accessToken: string; refreshToken: string; isRecovery: boolean }
  | { type: "code"; code: string; isRecovery: boolean }
  | { type: "error"; message: string };

function readParams(part: string | undefined) {
  const params: Record<string, string> = {};
  if (!part) return params;
  for (const pair of part.split("&")) {
    if (!pair) continue;
    const [rawKey, ...rest] = pair.split("=");
    const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, " "));
    params[decode(rawKey)] = decode(rest.join("="));
  }
  return params;
}

/**
 * Interpreta la URL con la que Supabase vuelve a la app tras un enlace de correo.
 * Soporta el flujo implícito (tokens en el fragmento #) y PKCE (?code=).
 * Devuelve null si la URL no trae datos de autenticación.
 */
export function parseAuthRedirect(url: string): AuthRedirect | null {
  const [beforeHash, hash] = url.split("#", 2);
  const [path, query] = beforeHash.split("?", 2);
  const params = { ...readParams(query), ...readParams(hash) };
  const isRecovery = params.type === "recovery" || path.includes(PASSWORD_RESET_PATH);

  if (params.error || params.error_description) {
    return { type: "error", message: params.error_description || params.error };
  }
  if (params.access_token && params.refresh_token) {
    return {
      type: "tokens",
      accessToken: params.access_token,
      refreshToken: params.refresh_token,
      isRecovery,
    };
  }
  if (params.code) {
    return { type: "code", code: params.code, isRecovery };
  }
  return null;
}
