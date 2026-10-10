'use server'

import { revalidatePath } from 'next/cache'
import { incidentAccess } from './access'
import { validateNew, validateUpdate, type ActionState } from './model'
import { friendlyError } from '@/lib/errors'

function refreshIncidents(serviceId?: string | null) {
  revalidatePath('/dashboard/incidentes')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/flota')
  revalidatePath('/dashboard/conductores')
  if (serviceId) revalidatePath(`/dashboard/rutas/${serviceId}`)
}

export async function createIncident(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const values = validateNew(form)
    const { supabase, profile } = await incidentAccess()
    const { error } = await supabase.from('incidents').insert({
      ...values, company_id: profile.company_id, reported_by_profile_id: profile.id,
      reported_by_type: 'admin', status: 'open',
    })
    if (error) return { error: friendlyError(error, 'No se pudo registrar el incidente') }
    refreshIncidents()
    return { success: 'Incidente registrado.', revision: crypto.randomUUID() }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo registrar el incidente.' }
  }
}

export async function updateIncident(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const values = validateUpdate(form)
    const { supabase, profile } = await incidentAccess()
    const { data: incident, error: readError } = await supabase.from('incidents')
      .select('id, status, updated_at, resolved_at, service_id')
      .eq('id', values.id).eq('company_id', profile.company_id).is('deleted_at', null).single()
    if (readError || !incident) return { error: 'El incidente ya no está disponible para tu empresa.' }
    if (incident.updated_at !== values.updatedAt) return { error: 'Otro usuario modificó este incidente. Recarga la página antes de guardar.' }
    const resolvedAt = values.status === 'resolved'
      ? (incident.status === 'resolved' ? incident.resolved_at ?? new Date().toISOString() : new Date().toISOString())
      : null
    // Compare-and-set prevents overwriting a concurrent edit between the read and update.
    const { data: updated, error } = await supabase.from('incidents')
      .update({ status: values.status, resolution_notes: values.notes || null, resolved_at: resolvedAt })
      .eq('id', values.id).eq('company_id', profile.company_id)
      .eq('updated_at', values.updatedAt).is('deleted_at', null).select('id').maybeSingle()
    if (error) return { error: friendlyError(error, 'No se pudo actualizar el incidente') }
    if (!updated) return { error: 'El incidente cambió mientras lo editabas. Recarga la página e inténtalo nuevamente.' }
    refreshIncidents(incident.service_id)
    return { success: 'Seguimiento actualizado.', revision: crypto.randomUUID() }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo actualizar el incidente.' }
  }
}
