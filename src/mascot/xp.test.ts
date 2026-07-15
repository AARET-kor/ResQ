import { describe, it, expect } from 'vitest'
import { xpToReachLevel, levelFromXp, levelProgress } from './xp'

describe('xp curve', () => {
  it('thresholds are 100 * triangular(level-1)', () => {
    expect(xpToReachLevel(1)).toBe(0)
    expect(xpToReachLevel(2)).toBe(100)
    expect(xpToReachLevel(3)).toBe(300)
    expect(xpToReachLevel(4)).toBe(600)
  })
  it('levelFromXp picks the highest reached level', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(99)).toBe(1)
    expect(levelFromXp(100)).toBe(2)
    expect(levelFromXp(299)).toBe(2)
    expect(levelFromXp(300)).toBe(3)
  })
  it('levelProgress reports xp within the current level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpInLevel: 0, xpForLevel: 100 })
    expect(levelProgress(150)).toEqual({ level: 2, xpInLevel: 50, xpForLevel: 200 })
  })
})
