import 'server-only'
import { createClient } from '@/lib/supabase/server'

// Every action checks authorization independently of the dashboard layout.
export async function incidentAccess() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.')
  const { data: profile, error } = await supabase.from('profiles')
    .select('id, company_id, role').eq('id', user.id).single()
  if (error || !profile?.company_id || profile.role !== 'admin') {
    throw new Error('Necesitas un perfil de administrador asociado a una empresa.')
  }
  return { supabase, profile }
}
