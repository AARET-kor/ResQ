export interface LevelProgress {
  level: number
  xpInLevel: number
  xpForLevel: number
}

/** Cumulative XP required to REACH `level` (level 1 = 0). Curve: 100 * triangular(level-1). */
export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0
  const n = level - 1
  return (100 * (n * (n + 1))) / 2
}

/** Highest level whose threshold is <= totalXp. */
export function levelFromXp(totalXp: number): number {
  let level = 1
  while (xpToReachLevel(level + 1) <= totalXp) level++
  return level
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromXp(totalXp)
  const base = xpToReachLevel(level)
  const next = xpToReachLevel(level + 1)
  return { level, xpInLevel: totalXp - base, xpForLevel: next - base }
}
