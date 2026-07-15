import { describe, it, expect } from 'vitest'
import { mascotArt } from './mascotAssets'
import { ANIMALS } from './roster'

describe('mascotArt', () => {
  it('returns a glyph for every animal', () => {
    for (const a of ANIMALS) {
      expect(mascotArt(a.id, 'INTERN')).toBe(a.glyph)
    }
  })
  it('falls back for an unknown animal', () => {
    expect(mascotArt('nope', 'CHIEF')).toBe('🐣')
  })
})
