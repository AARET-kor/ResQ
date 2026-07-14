import { describe, it, expect } from 'vitest'
import { pickSpecies } from './species'
import { SPECIES_IDS } from './roster'

describe('pickSpecies', () => {
  it('maps a [0,1) random into a roster id', () => {
    expect(pickSpecies(0)).toBe(SPECIES_IDS[0])
    expect(pickSpecies(0.999)).toBe(SPECIES_IDS[SPECIES_IDS.length - 1])
  })
  it('always returns a valid roster id', () => {
    for (const r of [0, 0.1, 0.33, 0.5, 0.8, 0.9999]) {
      expect(SPECIES_IDS).toContain(pickSpecies(r))
    }
  })
})
