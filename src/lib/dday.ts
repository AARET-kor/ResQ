export interface DdayResult {
  /** Whole days remaining until `end`, never negative. */
  daysLeft: number
  /** Progress from `start`→`end` as a percentage, clamped to [0,100]. */
  percent: number
}

const MS_PER_DAY = 86_400_000

export function computeDday(start: Date, end: Date, now: Date = new Date()): DdayResult {
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY))
  const total = end.getTime() - start.getTime()
  if (total <= 0) return { daysLeft, percent: 100 }
  const elapsed = now.getTime() - start.getTime()
  const percent = Math.min(100, Math.max(0, (elapsed / total) * 100))
  return { daysLeft, percent }
}
