import { describe, expect, it } from 'vitest'
import {
  anomalyMeta, auditStatusMeta, deviationColor, deviationPct, formatDeviation, formatKm, formatMinutes,
} from '@/lib/service-audit'

describe('estimado vs. real', () => {
  it('calcula la desviación porcentual y la formatea', () => {
    expect(deviationPct(40, 50)).toBe(25)
    expect(deviationPct(40, 30)).toBe(-25)
    expect(deviationPct(null, 30)).toBeNull()
    expect(deviationPct(0, 30)).toBeNull()
    expect(formatDeviation(25)).toBe('+25 %')
    expect(formatDeviation(-8)).toBe('−8 %')
    expect(formatDeviation(null)).toBe('—')
  })

  it('colorea según la magnitud', () => {
    expect(deviationColor(10)).toBe('#55d9ad')
    expect(deviationColor(-25)).toBe('#fdba74')
    expect(deviationColor(45)).toBe('#fda4af')
  })

  it('formatea minutos y kilómetros', () => {
    expect(formatMinutes(42)).toBe('42 min')
    expect(formatMinutes(95)).toBe('1 h 35 min')
    expect(formatMinutes('-7.4')).toBe('−7 min')
    expect(formatMinutes(null)).toBe('—')
    expect(formatKm(null)).toBe('—')
  })
})

describe('vocabulario', () => {
  it('traduce anomalías conocidas y deja pasar las desconocidas', () => {
    expect(anomalyMeta('simulated_gps')).toMatchObject({ label: 'GPS simulado', severity: 'high' })
    expect(anomalyMeta('algo_nuevo')).toMatchObject({ label: 'algo_nuevo', severity: 'low' })
  })

  it('estado de auditoría por defecto es "Sin auditar"', () => {
    expect(auditStatusMeta(null).label).toBe('Sin auditar')
    expect(auditStatusMeta('observed').label).toBe('Observado')
  })
})
