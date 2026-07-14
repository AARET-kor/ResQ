import { describe, it, expect } from 'vitest'
import { computeDday } from './dday'

describe('computeDday', () => {
  const start = new Date('2024-03-01')
  const end = new Date('2028-02-28')

  it('counts whole days remaining until end', () => {
    const now = new Date('2028-02-18')
    expect(computeDday(start, end, now).daysLeft).toBe(10)
  })

  it('clamps daysLeft to 0 once the end has passed', () => {
    const now = new Date('2028-03-15')
    expect(computeDday(start, end, now).daysLeft).toBe(0)
  })

  it('reports progress percent between start and end', () => {
    const now = new Date('2026-03-01')
    const { percent } = computeDday(start, end, now)
    expect(percent).toBeGreaterThan(48)
    expect(percent).toBeLessThan(52)
  })

  it('clamps percent to [0,100]', () => {
    expect(computeDday(start, end, new Date('2020-01-01')).percent).toBe(0)
    expect(computeDday(start, end, new Date('2030-01-01')).percent).toBe(100)
  })

  it('returns 100 percent when the range is non-positive', () => {
    const d = new Date('2025-01-01')
    expect(computeDday(d, d, d).percent).toBe(100)
  })
})
