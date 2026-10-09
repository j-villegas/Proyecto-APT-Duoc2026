'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveRoute(form: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Inicia sesión nuevamente.' }
  const { data: profile } = await supabase.from('profiles').select('company_id, role, status, deleted_at').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin' || profile.status !== 'active' || profile.deleted_at) return { error: 'Solo administradores activos pueden gestionar rutas.' }
  const value = (key: string) => String(form.get(key) ?? '').trim()
  const id = value('id')
  const operation = value('operation')
  let payload
  if (operation === 'delete') {
    if (!id) return { error: 'Selecciona una ruta.' }
    // Preserve service history and all related stops/passengers.
    payload = { deleted_at: new Date().toISOString(), status: 'inactive' }
  } else {
    if (!['create', 'update'].includes(operation) || (operation === 'update' && !id)) return { error: 'Operación inválida.' }
    if (['route_code', 'name', 'origin_name', 'destination_name'].some(key => !value(key))) return { error: 'Completa código, nombre, origen y destino.' }
    if (!['active', 'inactive'].includes(value('status'))) return { error: 'Estado inválido.' }
    const duration = value('estimated_duration_minutes')
    const distance = value('estimated_distance_km')
    if ((duration && (!Number.isInteger(Number(duration)) || Number(duration) < 0)) || (distance && (!Number.isFinite(Number(distance)) || Number(distance) < 0))) return { error: 'Duración y distancia deben ser números positivos; la duración debe ser entera.' }
    payload = {
      route_code: value('route_code'), name: value('name'),
      origin_name: value('origin_name'), destination_name: value('destination_name'),
      status: value('status'), notes: value('notes') || null,
      estimated_duration_minutes: duration ? Number(duration) : null,
      estimated_distance_km: distance ? Number(distance) : null,
    }
    // Editing a label does not provide new geographic coordinates.
    if (operation === 'update') {
      const { data: existing } = await supabase.from('routes').select('origin_name, destination_name').eq('id', id).eq('company_id', profile.company_id).is('deleted_at', null).single()
      if (!existing) return { error: 'La ruta ya no está disponible.' }
      payload = { ...payload,
        ...(existing.origin_name !== payload.origin_name ? { origin_address: null, origin_latitude: null, origin_longitude: null } : {}),
        ...(existing.destination_name !== payload.destination_name ? { destination_address: null, destination_latitude: null, destination_longitude: null } : {}),
      }
    }
  }
  const result = operation === 'create'
    ? await supabase.from('routes').insert({ ...payload, company_id: profile.company_id }).select('id').single()
    : await supabase.from('routes').update(payload).eq('id', id).eq('company_id', profile.company_id).is('deleted_at', null).select('id').single()
  if (result.error) return { error: result.error.code === '23505' ? 'Ese código ya está reservado, incluso si la ruta fue eliminada. Usa otro código.' : 'No se pudo guardar la ruta. Verifica tus permisos y vuelve a intentar.' }
  revalidatePath('/dashboard/rutas', 'layout')
  return { success: true }
}
