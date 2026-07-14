import { describe, it, expect } from 'vitest'
import { SPECIES, SPECIES_IDS, speciesById } from './roster'
import { XP_AMOUNTS } from './events'

describe('roster', () => {
  it('has a non-empty roster with unique ids', () => {
    expect(SPECIES.length).toBeGreaterThan(1)
    expect(new Set(SPECIES_IDS).size).toBe(SPECIES_IDS.length)
  })
  it('looks species up by id', () => {
    expect(speciesById(SPECIES_IDS[0])?.id).toBe(SPECIES_IDS[0])
    expect(speciesById('nope')).toBeUndefined()
  })
})

describe('xp amounts', () => {
  it('defines an amount for every event type', () => {
    expect(XP_AMOUNTS.daily_login).toBe(10)
    expect(XP_AMOUNTS.read_paper).toBeGreaterThan(0)
    expect(XP_AMOUNTS.schedule_done).toBeGreaterThan(0)
    expect(XP_AMOUNTS.weekly_academic).toBeGreaterThan(0)
  })
})
