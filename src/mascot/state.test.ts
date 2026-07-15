import { describe, it, expect } from 'vitest'
import { deriveMascotState } from './state'
import { variantForUser } from './roster'
import type { Profile } from '../lib/profile'

const base: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 150, mascot_level: 1, mascot_stage: 1,
  mascot_species: null, mascot_name: null, last_active_on: '2026-07-15', streak_days: 3,
}

describe('deriveMascotState (specialty-driven)', () => {
  it('derives the animal from the specialty, not from stored species', () => {
    const s = deriveMascotState(base, '2026-07-15')
    expect(s.speciesId).toBe('dog')       // 내과 → 강아지
    expect(s.speciesLabel).toBe('강아지')
    expect(s.name).toBe('큐비')
    expect(s.level).toBe(2)
    expect(s.stage).toBe('SENIOR')
    expect(s.mood).toBe('ENERGIZED')
  })
  it('assigns a stable hashed variant', () => {
    const s = deriveMascotState(base, '2026-07-15')
    const v = variantForUser('u1')
    expect(s.variantLabel).toBe(v.label)
    expect(s.variantAccent).toBe(v.accent)
    expect(deriveMascotState(base, '2026-07-15').variantLabel).toBe(s.variantLabel)
  })
  it('falls back to alpaca for an unmapped specialty', () => {
    const s = deriveMascotState({ ...base, specialty: '우주의학과' }, '2026-07-15')
    expect(s.speciesId).toBe('alpaca')
  })
  it('ignores the legacy stored mascot_species column', () => {
    const s = deriveMascotState({ ...base, mascot_species: 'penguin' }, '2026-07-15')
    expect(s.speciesId).toBe('dog')
  })
})
