import { describe, it, expect } from 'vitest'
import { moodFor, daysInactive } from './mood'

const today = '2026-07-14'

describe('mood', () => {
  it('counts whole days since last active', () => {
    expect(daysInactive('2026-07-14', today)).toBe(0)
    expect(daysInactive('2026-07-12', today)).toBe(2)
    expect(daysInactive(null, today)).toBeNull()
  })
  it('derives mood from inactivity', () => {
    expect(moodFor('2026-07-14', today)).toBe('ENERGIZED')
    expect(moodFor('2026-07-13', today)).toBe('NORMAL')
    expect(moodFor('2026-07-12', today)).toBe('TIRED')
    expect(moodFor('2026-07-11', today)).toBe('TIRED')
    expect(moodFor('2026-07-10', today)).toBe('ASLEEP')
    expect(moodFor(null, today)).toBe('NORMAL')
  })
})
