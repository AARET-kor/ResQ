import { describe, it, expect } from 'vitest'
import { mascotArt } from './mascotAssets'
import { SPECIES_IDS } from './roster'

describe('mascotArt', () => {
  it('returns a non-empty glyph for every species', () => {
    for (const id of SPECIES_IDS) {
      expect(mascotArt(id, 'INTERN')).toBeTruthy()
    }
  })
  it('falls back for an unknown species', () => {
    expect(mascotArt('nope', 'CHIEF')).toBeTruthy()
  })
})
