import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, dayStartCL, isPastCL, nowCL, todayCL } from '@/lib/date'

afterEach(() => {
  vi.useRealTimers()
})

describe('todayCL / nowCL', () => {
  it('usa la fecha de Chile aunque en UTC ya sea el día siguiente', () => {
    // 10 oct 01:30 UTC = 9 oct 22:30 en Chile (UTC-3)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T01:30:00Z'))
    expect(todayCL()).toBe('2026-10-09')
    expect(nowCL()).toEqual({ date: '2026-10-09', time: '22:30:00' })
  })
})

describe('isPastCL', () => {
  const now = { date: '2026-10-09', time: '22:30:00' }

  it.each([
    ['2026-10-08', '23:59:00', true],
    ['2026-10-10', '00:00:00', false],
    ['2026-10-09', '22:29:59', true],
    ['2026-10-09', '22:30:01', false],
    ['2026-10-09', null, true],
  ])('%s %s -> %s', (date, time, expected) => {
    expect(isPastCL(date, time, now)).toBe(expected)
  })

  it('sin fecha nunca está vencido', () => {
    expect(isPastCL(null, '08:00:00', now)).toBe(false)
  })
})

describe('addDays', () => {
  it('cruza meses y años', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('dayStartCL', () => {
  it('aplica el horario de verano e invierno de Chile', () => {
    expect(dayStartCL('2026-12-15')).toBe('2026-12-15T00:00:00-03:00')
    expect(dayStartCL('2026-07-15')).toBe('2026-07-15T00:00:00-04:00')
  })
})
