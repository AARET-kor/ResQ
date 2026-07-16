import { describe, it, expect, vi } from 'vitest'
import { insertGoogleEvent, markEventSynced, GOOGLE_AUTH_ERROR } from './gcal'
import type { EventItem } from './events'

const ev: EventItem = {
  id: 'e1', user_id: 'u1', title: '학회', starts_at: '2026-08-20T09:00:00+09:00',
  ends_at: null, kind: 'conference', location: '코엑스', notes: null,
}

describe('insertGoogleEvent', () => {
  it('POSTs the event with alarms and returns the gcal id', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ id: 'g123' }) })
    const id = await insertGoogleEvent('tok', ev, fetcher as any)
    expect(id).toBe('g123')
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toContain('calendars/primary/events')
    expect(init.headers.Authorization).toBe('Bearer tok')
    const body = JSON.parse(init.body)
    expect(body.summary).toBe('학회')
    expect(body.reminders.overrides).toEqual([
      { method: 'popup', minutes: 30 },
      { method: 'popup', minutes: 1440 }, // conference → day-before too
    ])
    expect(body.end.dateTime).toBeTruthy() // 1h default end
  })
  it('throws GOOGLE_AUTH_ERROR on 401 so the UI can prompt reconnect', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    await expect(insertGoogleEvent('tok', ev, fetcher as any)).rejects.toThrow(GOOGLE_AUTH_ERROR)
  })
})

describe('markEventSynced', () => {
  it('stores the gcal id on the event row', async () => {
    const calls: any[] = []
    const client = {
      from: () => ({
        update: (v: any) => ({ eq: (_c: string, id: string) => { calls.push({ id, ...v }); return Promise.resolve({ error: null }) } }),
      }),
    } as any
    await markEventSynced(client, 'e1', 'g123')
    expect(calls[0]).toEqual({ id: 'e1', gcal_id: 'g123' })
  })
})
