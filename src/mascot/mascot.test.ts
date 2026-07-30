import { describe, expect, it } from 'vitest'
import { recordDailyLogin, recordXpEvent } from './mascot'
import type { Profile } from '../lib/profile'

const base: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 40, mascot_level: 1, mascot_stage: 1,
  mascot_species: null, mascot_name: null, last_active_on: null, streak_days: 0,
}

function fakeClient(results: Record<string, Profile | null>, error: unknown = null) {
  const calls: { fn: string; args: unknown }[] = []
  return {
    calls,
    rpc: (fn: string, args?: unknown) => {
      calls.push({ fn, args })
      return Promise.resolve({ data: results[fn] ?? null, error })
    },
  } as any
}

describe('server-authoritative mascot XP', () => {
  it('delegates daily login amount, day, and streak calculation to the server', async () => {
    const updated = { ...base, xp: 50, last_active_on: '2026-07-24', streak_days: 2 }
    const client = fakeClient({ grant_daily_login_xp: updated })
    expect(await recordDailyLogin(client, base, 'spoofed-client-day')).toEqual(updated)
    expect(client.calls).toEqual([{ fn: 'grant_daily_login_xp', args: undefined }])
  })

  it('grants paper XP through a fixed server RPC tied to the saved PMID', async () => {
    const updated = { ...base, xp: 60 }
    const client = fakeClient({ grant_paper_read_xp: updated })
    expect(await recordXpEvent(client, base, 'read_paper', '12345')).toEqual(updated)
    expect(client.calls).toEqual([{
      fn: 'grant_paper_read_xp',
      args: { p_pmid: '12345' },
    }])
  })

  it('does not silently accept an RPC failure', async () => {
    const client = fakeClient({}, { message: 'denied' })
    await expect(recordDailyLogin(client, base, '2026-07-24')).rejects.toEqual({ message: 'denied' })
  })
})
