import { describe, it, expect } from 'vitest'
import { mascotArt, STAGE_ART } from './mascotAssets'
import type { Stage } from './stage'

const STAGES: Stage[] = ['INTERN', 'JUNIOR', 'SENIOR', 'CHIEF']

describe('mascotArt (stage figurines)', () => {
  it('returns a distinct https image URL for every stage', () => {
    const urls = STAGES.map((s) => mascotArt('dog', s))
    expect(new Set(urls).size).toBe(4)
    for (const u of urls) expect(u).toMatch(/^https:\/\//)
  })
  it('is species-independent for now (shared figurine set)', () => {
    expect(mascotArt('dog', 'INTERN')).toBe(mascotArt('chameleon', 'INTERN'))
  })
  it('every stage has bg and panel colors', () => {
    for (const s of STAGES) {
      expect(STAGE_ART[s].bg).toMatch(/^#/)
      expect(STAGE_ART[s].panel).toMatch(/^#/)
    }
  })
})
