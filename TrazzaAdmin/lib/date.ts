const TIMEZONE = 'America/Santiago'

/** Current calendar date (YYYY-MM-DD) in Chile local time, regardless of server timezone. */
export function todayCL(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
}
