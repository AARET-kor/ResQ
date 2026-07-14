export type Mood = 'ENERGIZED' | 'NORMAL' | 'TIRED' | 'ASLEEP'

const MS_PER_DAY = 86_400_000

/** Whole days between an ISO date and today; null if never active. */
export function daysInactive(lastActiveOn: string | null | undefined, todayISO: string): number | null {
  if (!lastActiveOn) return null
  const last = new Date(lastActiveOn).getTime()
  const today = new Date(todayISO).getTime()
  return Math.floor((today - last) / MS_PER_DAY)
}

export function moodFor(lastActiveOn: string | null | undefined, todayISO: string): Mood {
  const days = daysInactive(lastActiveOn, todayISO)
  if (days === null) return 'NORMAL'
  if (days <= 0) return 'ENERGIZED'
  if (days === 1) return 'NORMAL'
  if (days <= 3) return 'TIRED'
  return 'ASLEEP'
}
