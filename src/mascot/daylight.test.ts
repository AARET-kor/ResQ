import { describe, it, expect } from 'vitest'
import { timeOfDayKST, SKY } from './daylight'

// UTC instants chosen so the KST (+9) hour hits each boundary.
describe('timeOfDayKST', () => {
  it('maps KST hours to phases regardless of machine timezone', () => {
    expect(timeOfDayKST(new Date('2026-07-15T20:00:00Z'))).toBe('DAWN')  // 05:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T22:59:00Z'))).toBe('DAWN')  // 07:59 KST
    expect(timeOfDayKST(new Date('2026-07-15T23:00:00Z'))).toBe('DAY')   // 08:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T00:00:00Z'))).toBe('DAY')   // 09:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T08:00:00Z'))).toBe('DUSK')  // 17:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T10:59:00Z'))).toBe('DUSK')  // 19:59 KST
    expect(timeOfDayKST(new Date('2026-07-15T11:00:00Z'))).toBe('NIGHT') // 20:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T15:00:00Z'))).toBe('NIGHT') // 00:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T19:59:00Z'))).toBe('NIGHT') // 04:59 KST
  })
  it('has a sky gradient for every phase', () => {
    for (const p of ['DAWN', 'DAY', 'DUSK', 'NIGHT'] as const) {
      expect(SKY[p]).toContain('gradient')
    }
  })
})
