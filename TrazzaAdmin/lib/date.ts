const TIMEZONE = 'America/Santiago'

/** Current calendar date (YYYY-MM-DD) in Chile local time, regardless of server timezone. */
export function todayCL(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
}

/** Current date and time (HH:MM:SS) in Chile, comparable with services.scheduled_date / scheduled_start_time. */
export function nowCL(): { date: string; time: string } {
  const now = new Date()
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(now)
  return { date: todayCL(), time }
}

/** true if a date + time (Chile local, as stored in the DB) is already in the past. */
export function isPastCL(date: string | null, time: string | null, now = nowCL()): boolean {
  if (!date) return false
  if (date !== now.date) return date < now.date
  return (time ?? '00:00:00') < now.time
}

/** Adds days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Start of a calendar day in Chile as a timestamp with offset (e.g. 2026-10-09T00:00:00-03:00). */
export function dayStartCL(date: string): string {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00'
  return `${date}T00:00:00${offset}`
}
