import { describe, it, expect } from 'vitest'
import { deriveMascotState } from './state'
import type { Profile } from '../lib/profile'

const base: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 150, mascot_level: 1, mascot_stage: 1,
  mascot_species: 'frog', mascot_name: null, last_active_on: '2026-07-14', streak_days: 3,
}

describe('deriveMascotState', () => {
  it('combines species, level, stage, mood and defaults the name to 큐비', () => {
    const s = deriveMascotState(base, '2026-07-14')
    expect(s.speciesId).toBe('frog')
    expect(s.speciesLabel).toBe('개구리')
    expect(s.name).toBe('큐비')
    expect(s.level).toBe(2)
    expect(s.xpInLevel).toBe(50)
    expect(s.xpForLevel).toBe(200)
    expect(s.stage).toBe('SENIOR')
    expect(s.mood).toBe('ENERGIZED')
    expect(s.streakDays).toBe(3)
  })
  it('uses a custom mascot name when set', () => {
    const s = deriveMascotState({ ...base, mascot_name: '몽이' }, '2026-07-14')
    expect(s.name).toBe('몽이')
  })
  it('falls back to the first species if the stored id is unknown', () => {
    const s = deriveMascotState({ ...base, mascot_species: 'ghost' }, '2026-07-14')
    expect(s.speciesId).toBe('cow')
  })
})
