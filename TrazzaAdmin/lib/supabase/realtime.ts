import type { createClient } from '@/lib/supabase/client'

type BrowserClient = ReturnType<typeof createClient>

/**
 * Autentica la conexión de Realtime con la sesión actual ANTES de suscribirse.
 *
 * supabase-js solo pasa el token a Realtime en SIGNED_IN / TOKEN_REFRESHED, no
 * cuando la sesión se restaura desde cookies al abrir o recargar la página.
 * Si el canal se une antes, entra como anónimo y las policies RLS filtran todos
 * los eventos: la pantalla deja de actualizarse en vivo sin mostrar error.
 */
export async function authenticateRealtime(supabase: BrowserClient) {
  const { data } = await supabase.auth.getSession()
  await supabase.realtime.setAuth(data.session?.access_token ?? null)
}
