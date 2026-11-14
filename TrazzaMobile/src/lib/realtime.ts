import { supabase } from "./supabase";

/**
 * Autentica Realtime con la sesión actual antes de suscribirse. supabase-js no
 * lo hace cuando la sesión se restaura del almacenamiento al abrir la app, y un
 * canal unido como anónimo no recibe eventos (RLS los filtra).
 */
export async function authenticateRealtime() {
  try {
    const { data } = await supabase.auth.getSession();
    await supabase.realtime.setAuth(data.session?.access_token ?? null);
  } catch {
    // Sin sesión o sin red: el canal intentará igual y se reintenta al recargar.
  }
}
