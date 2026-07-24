import { describe, it, expect } from 'vitest'
import { listEventsInRange, addEvent, deleteEvent, EVENT_KINDS, type EventItem } from './events'

function fakeClient(rows: EventItem[]) {
  const calls: { op: string; args: any }[] = []
  const client = {
    calls,
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            gte: () => ({
              lt: () => ({
                order: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      }),
      insert: (values: any) => ({
        select: () => ({
          single: () => {
            calls.push({ op: 'insert', args: values })
            return Promise.resolve({ data: { id: 'e-new', ...values }, error: null })
          },
        }),
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          calls.push({ op: 'delete', args: { id } })
          return Promise.resolve({ error: null })
        },
      }),
      update: (values: any) => ({
        eq: (_c: string, id: string) => ({
          not: () => ({
            select: () => {
              const row = rows.find((item) => item.id === id && item.external_id)
              if (row) calls.push({ op: 'update', args: { id, ...values } })
              return Promise.resolve({ data: row ? [{ id }] : [], error: null })
            },
          }),
        }),
      }),
    }),
  }
  return client as any
}

const e1: EventItem = {
  id: 'e1', user_id: 'u1', title: '학회', starts_at: '2026-07-20T09:00:00+09:00',
  ends_at: null, kind: 'conference', location: null, notes: null,
}

describe('events data access', () => {
  it('lists events in a range', async () => {
    expect(await listEventsInRange(fakeClient([e1]), 'u1', '2026-07-01', '2026-08-01')).toHaveLength(1)
  })
  it('adds an event with user id and kind', async () => {
    const c = fakeClient([])
    const e = await addEvent(c, 'u1', { title: '수술', starts_at: '2026-07-21T08:00:00+09:00', kind: 'surgery' })
    expect(e.kind).toBe('surgery')
    expect(c.calls[0].args.user_id).toBe('u1')
  })
  it('deletes an event', async () => {
    const c = fakeClient([e1])
    await deleteEvent(c, 'e1')
    expect(c.calls[0]).toEqual({ op: 'delete', args: { id: 'e1' } })
  })
  it('keeps an external event as a pending deletion tombstone', async () => {
    const c = fakeClient([{ ...e1, external_id: 'g1', source_provider: 'google' }])
    await deleteEvent(c, 'e1')
    expect(c.calls[0].op).toBe('update')
    expect(c.calls[0].args.sync_status).toBe('pending')
  })
  it('exposes Korean labels for every kind', () => {
    for (const k of Object.keys(EVENT_KINDS)) {
      expect(EVENT_KINDS[k as keyof typeof EVENT_KINDS]).toBeTruthy()
    }
    expect(EVENT_KINDS.conference).toBe('학회')
    expect(EVENT_KINDS.surgery).toBe('수술')
  })
})
