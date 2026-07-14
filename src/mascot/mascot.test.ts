import { describe, it, expect } from 'vitest'
import { assignSpeciesIfMissing, recordDailyLogin } from './mascot'
import type { Profile } from '../lib/profile'

function fakeClient(row: Profile, insertError: unknown = null) {
  const inserts: { table: string; values: any }[] = []
  const client = {
    inserts,
    from: (table: string) => ({
      upsert: (values: any) => ({
        select: () => ({ single: () => Promise.resolve({ data: { ...row, ...values }, error: null }) }),
      }),
      insert: (values: any) => {
        inserts.push({ table, values })
        return Promise.resolve({ error: insertError })
      },
    }),
  }
  return client as any
}

const base: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 40, mascot_level: 1, mascot_stage: 1,
  mascot_species: null, mascot_name: null, last_active_on: null, streak_days: 0,
}

describe('assignSpeciesIfMissing', () => {
  it('assigns a species when none is set', async () => {
    const p = await assignSpeciesIfMissing(fakeClient(base), base, 0)
    expect(p.mascot_species).toBeTruthy()
  })
  it('leaves an existing species untouched', async () => {
    const withSpecies = { ...base, mascot_species: 'bear' }
    const p = await assignSpeciesIfMissing(fakeClient(withSpecies), withSpecies, 0.99)
    expect(p.mascot_species).toBe('bear')
  })
})

describe('recordDailyLogin', () => {
  it('grants +10 XP and records the event on a new day', async () => {
    const client = fakeClient(base)
    const p = await recordDailyLogin(client, base, '2026-07-14')
    expect(p.xp).toBe(50)
    expect(p.last_active_on).toBe('2026-07-14')
    expect(p.streak_days).toBe(1)
    expect(client.inserts).toEqual([
      { table: 'xp_events', values: { user_id: 'u1', type: 'daily_login', amount: 10, day: '2026-07-14' } },
    ])
  })
  it('increments the streak when the previous active day was yesterday', async () => {
    const yesterday = { ...base, last_active_on: '2026-07-13', streak_days: 4 }
    const p = await recordDailyLogin(fakeClient(yesterday), yesterday, '2026-07-14')
    expect(p.streak_days).toBe(5)
  })
  it('is a no-op when already logged in today', async () => {
    const todayRow = { ...base, last_active_on: '2026-07-14', xp: 70 }
    const client = fakeClient(todayRow)
    const p = await recordDailyLogin(client, todayRow, '2026-07-14')
    expect(p.xp).toBe(70)
    expect(client.inserts).toHaveLength(0)
  })
  it('does NOT grant XP when the ledger insert is rejected (duplicate day)', async () => {
    // Simulates the unique-index race: a concurrent run already inserted today.
    const client = fakeClient(base, { code: '23505', message: 'duplicate key' })
    const p = await recordDailyLogin(client, base, '2026-07-14')
    expect(p.xp).toBe(40) // unchanged — no double grant
    expect(p).toBe(base)
  })
})
