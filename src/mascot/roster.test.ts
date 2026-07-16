import { describe, it, expect } from 'vitest'
import {
  ANIMALS, animalById, animalForSpecialty, SPECIALTIES,
  VARIANTS, variantForUser,
} from './roster'
import { XP_AMOUNTS } from './events'

describe('specialty → animal mapping', () => {
  it('maps representative specialties to their animals', () => {
    expect(animalForSpecialty('내과').id).toBe('dog')
    expect(animalForSpecialty('정형외과').id).toBe('cow')
    expect(animalForSpecialty('외과').id).toBe('horse')
    expect(animalForSpecialty('마취통증의학과').id).toBe('chameleon')
    expect(animalForSpecialty('응급의학과').id).toBe('tiger')
    expect(animalForSpecialty('성형외과').id).toBe('peacock')
  })
  it('falls back to alpaca for unmapped/missing specialty', () => {
    expect(animalForSpecialty('우주의학과').id).toBe('alpaca')
    expect(animalForSpecialty(null).id).toBe('alpaca')
    expect(animalForSpecialty(undefined).id).toBe('alpaca')
  })
  it('resolves common short/legacy names via aliases', () => {
    expect(animalForSpecialty('마취과').id).toBe('chameleon')
    expect(animalForSpecialty('정신과').id).toBe('cat')
    expect(animalForSpecialty('소아과').id).toBe('rabbit')
    expect(animalForSpecialty('비뇨기과').id).toBe('pig')
    expect(animalForSpecialty(' 마취과 ').id).toBe('chameleon') // trims whitespace
  })
  it('every mapped specialty resolves to a real animal with label/tint/glyph', () => {
    for (const s of SPECIALTIES) {
      const a = animalForSpecialty(s)
      expect(a.label).toBeTruthy()
      expect(a.tint).toMatch(/^#/)
      expect(a.glyph).toBeTruthy()
    }
  })
  it('animalById finds and misses correctly', () => {
    expect(animalById('dog')?.label).toBe('강아지')
    expect(animalById('nope')).toBeUndefined()
    expect(ANIMALS.length).toBeGreaterThan(10)
  })
})

describe('variants', () => {
  it('is stable for the same user id', () => {
    expect(variantForUser('user-abc')).toBe(variantForUser('user-abc'))
  })
  it('always returns one of the 4 variants', () => {
    for (const id of ['a', 'bb', 'ccc', 'u-1', 'u-2', 'u-3']) {
      expect(VARIANTS).toContain(variantForUser(id))
    }
  })
  it('spreads across variants for different ids', () => {
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) => variantForUser(`user-${i}`).id),
    )
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})

describe('xp amounts (unchanged)', () => {
  it('still defines all event types', () => {
    expect(XP_AMOUNTS.daily_login).toBe(10)
    expect(XP_AMOUNTS.read_paper).toBeGreaterThan(0)
  })
})
