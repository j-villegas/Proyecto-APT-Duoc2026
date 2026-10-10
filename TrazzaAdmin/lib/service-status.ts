import { isPastCL, type nowCL } from '@/lib/date'

// Vocabulario y colores únicos para el estado de un servicio en todo el panel
// (y alineados con la app móvil). Verde = en movimiento; azul = programado;
// ámbar = requiere atención; gris = cerrado; rojo = cancelado.

export type ServiceStatusKey = 'scheduled' | 'overdue' | 'in_progress' | 'completed' | 'cancelled'

export type StatusMeta = { label: string; bg: string; text: string; dot: string }

export const SERVICE_STATUS: Record<ServiceStatusKey, StatusMeta> = {
  scheduled:   { label: 'Programado',  bg: '#183352', text: '#7dbbff', dot: '#7dbbff' },
  overdue:     { label: 'No iniciado', bg: '#3b3020', text: '#fdba74', dot: '#fdba74' },
  in_progress: { label: 'En ruta',     bg: '#123b35', text: '#55d9ad', dot: '#10b98b' },
  completed:   { label: 'Finalizado',  bg: '#203650', text: '#bac9db', dot: '#a8b8cc' },
  cancelled:   { label: 'Cancelado',   bg: '#3d2332', text: '#fda4af', dot: '#fda4af' },
}

const UNKNOWN: StatusMeta = { label: '—', bg: '#203650', text: '#bac9db', dot: '#a8b8cc' }

/** Estado tal como está en la base. */
export function serviceStatusMeta(status: string | null): StatusMeta {
  return SERVICE_STATUS[status as ServiceStatusKey] ?? { ...UNKNOWN, label: status ?? '—' }
}

/** Estado para mostrar: un programado cuya hora ya pasó se muestra "No iniciado". Nunca escribe en la base. */
export function visualServiceStatus(
  status: string | null,
  scheduledDate: string | null,
  scheduledTime: string | null,
  now?: ReturnType<typeof nowCL>,
): StatusMeta {
  if (status === 'scheduled' && isPastCL(scheduledDate, scheduledTime, now)) return SERVICE_STATUS.overdue
  return serviceStatusMeta(status)
}
