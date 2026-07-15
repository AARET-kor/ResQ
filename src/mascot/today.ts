/** Local calendar date as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** The ISO date one day before the given ISO date. */
export function prevDayISO(iso: string): string {
  const t = new Date(iso).getTime() - 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}
