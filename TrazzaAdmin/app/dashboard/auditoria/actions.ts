'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { friendlyError } from '@/lib/errors'

// Acciones de auditoría (migración 030). La base valida rol admin y empresa
// dentro de cada función; aquí solo se traduce el error para personas.

type Result = { success: true } | { error: string }

export async function auditService(serviceId: string, decision: 'approved' | 'observed', notes: string): Promise<Result> {
  if (decision !== 'approved' && decision !== 'observed') return { error: 'Decisión inválida.' }
  if (decision === 'observed' && !notes.trim()) return { error: 'Escribe la observación para dejar el servicio observado.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_audit_service', {
    p_service_id: serviceId, p_decision: decision, p_notes: notes.trim() || null,
  })
  if (error) return { error: friendlyError(error, 'No se pudo registrar la auditoría') }
  revalidatePath('/dashboard/auditoria', 'layout')
  return { success: true }
}

export async function recalculateMetrics(serviceId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_consolidate_service_metrics', { p_service_id: serviceId })
  if (error) return { error: friendlyError(error, 'No se pudieron recalcular las métricas') }
  revalidatePath(`/dashboard/auditoria/${serviceId}`)
  return { success: true }
}
