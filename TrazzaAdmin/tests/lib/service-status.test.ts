import { describe, expect, it } from 'vitest'
import { SERVICE_STATUS, serviceStatusMeta, visualServiceStatus } from '@/lib/service-status'

const now = { date: '2026-10-09', time: '12:00:00' }

describe('visualServiceStatus', () => {
  it('un programado cuya hora pasó se muestra "No iniciado"', () => {
    expect(visualServiceStatus('scheduled', '2026-10-09', '08:00:00', now)).toBe(SERVICE_STATUS.overdue)
  })

  it('un programado a futuro sigue "Programado"', () => {
    expect(visualServiceStatus('scheduled', '2026-10-09', '18:00:00', now)).toBe(SERVICE_STATUS.scheduled)
  })

  it('los demás estados no dependen de la hora', () => {
    expect(visualServiceStatus('in_progress', '2026-01-01', '08:00:00', now).label).toBe('En ruta')
    expect(visualServiceStatus('completed', null, null, now).label).toBe('Finalizado')
    expect(visualServiceStatus('cancelled', null, null, now).label).toBe('Cancelado')
  })
})

describe('serviceStatusMeta', () => {
  it('muestra el valor crudo si el estado es desconocido, sin romper', () => {
    expect(serviceStatusMeta('archived').label).toBe('archived')
    expect(serviceStatusMeta(null).label).toBe('—')
  })

  it('usa un vocabulario único', () => {
    expect(Object.values(SERVICE_STATUS).map(s => s.label)).toEqual(['Programado', 'No iniciado', 'En ruta', 'Finalizado', 'Cancelado'])
  })
})
