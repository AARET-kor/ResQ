import { describe, it, expect } from 'vitest'
import { getProfile, upsertProfile, isProfileComplete, type Profile } from './profile'

function fakeClient(row: Partial<Profile> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
      upsert: (values: Partial<Profile>) => ({
        select: () => ({
          single: () => Promise.resolve({ data: { ...row, ...values }, error: null }),
        }),
      }),
    }),
  } as any
}

const full: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 0, mascot_level: 1, mascot_stage: 1,
}

describe('profile data access', () => {
  it('returns null when no row exists', async () => {
    expect(await getProfile(fakeClient(null), 'u1')).toBeNull()
  })

  it('returns the row when it exists', async () => {
    const p = await getProfile(fakeClient(full), 'u1')
    expect(p?.nickname).toBe('길동')
  })

  it('upsert returns the merged row', async () => {
    const p = await upsertProfile(fakeClient(full), { id: 'u1', nickname: '새이름' })
    expect(p.nickname).toBe('새이름')
  })

  it('isProfileComplete requires the onboarding fields', () => {
    expect(isProfileComplete(full)).toBe(true)
    expect(isProfileComplete({ ...full, nickname: null as any })).toBe(false)
    expect(isProfileComplete(null)).toBe(false)
  })
})
