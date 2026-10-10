import { createClient } from '@/lib/supabase/client'
import { todayCL } from '@/lib/date'
import { friendlyError } from '@/lib/errors'

/**
 * Elimina un vehículo del inventario (soft delete: deleted_at, igual que el
 * resto del panel; el historial de servicios, combustible y mantenciones se
 * conserva). Se rechaza si el vehículo está en un servicio en curso o en uno
 * programado desde hoy, para no dejar rutas sin vehículo.
 */
export async function deleteVehicle(vehicleId: string): Promise<void> {
  const supabase = createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) throw new Error('No se pudo verificar la sesión.')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single()
  if (profileErr || !profile?.company_id) throw new Error('No se encontró el perfil del usuario.')

  const { data: services, error: svcErr } = await supabase
    .from('services')
    .select('service_code, status')
    .eq('vehicle_id', vehicleId)
    .is('deleted_at', null)
    .or(`status.eq.in_progress,and(status.eq.scheduled,scheduled_date.gte.${todayCL()})`)
  if (svcErr) throw new Error(friendlyError(svcErr, 'No se pudieron revisar los servicios del vehículo'))

  if (services && services.length > 0) {
    const codes = services.map(s => s.service_code ?? 'sin código').join(', ')
    throw new Error(
      `No se puede eliminar: el vehículo está asignado a ${services.length} servicio(s) en curso o programado(s) (${codes}). ` +
      'Finalízalos, cancélalos o asígnales otro vehículo primero.'
    )
  }

  const { error: updErr } = await supabase
    .from('vehicles')
    .update({ deleted_at: new Date().toISOString(), status: 'out_of_service' })
    .eq('id', vehicleId)
    .eq('company_id', profile.company_id)
  if (updErr) throw new Error(friendlyError(updErr, 'No se pudo eliminar el vehículo'))
}
