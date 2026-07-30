import { describe, it, expect } from 'vitest'
import {
  addEvent,
  deleteEvent,
  EVENT_KINDS,
  eventOverlapsRange,
  listEventsInRange,
  listEventsOverlappingRange,
  type EventItem,
} from './events'

function fakeClient(rows: EventItem[]) {
  const calls: { op: string; args: any }[] = []
  const selectQuery = {
    eq: (column: string, value: unknown) => {
      calls.push({ op: 'eq', args: { column, value } })
      return selectQuery
    },
    is: (column: string, value: unknown) => {
      calls.push({ op: 'is', args: { column, value } })
      return selectQuery
    },
    gte: (column: string, value: unknown) => {
      calls.push({ op: 'gte', args: { column, value } })
      return selectQuery
    },
    lt: (column: string, value: unknown) => {
      calls.push({ op: 'lt', args: { column, value } })
      return selectQuery
    },
    or: (filter: string) => {
      calls.push({ op: 'or', args: filter })
      return selectQuery
    },
    order: (column: string, options: unknown) => {
      calls.push({ op: 'order', args: { column, options } })
      return Promise.resolve({ data: rows, error: null })
    },
  }
  const client = {
    calls,
    from: () => ({
      select: () => selectQuery,
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
  it('queries every event overlapping a range, including earlier starts', async () => {
    const c = fakeClient([{
      ...e1,
      starts_at: '2026-06-25T09:00:00+09:00',
      ends_at: '2026-07-02T18:00:00+09:00',
    }])
    expect(await listEventsOverlappingRange(
      c,
      'u1',
      '2026-06-28',
      '2026-08-09',
    )).toHaveLength(1)
    expect(c.calls).toContainEqual({
      op: 'lt',
      args: { column: 'starts_at', value: '2026-08-09' },
    })
    expect(c.calls).toContainEqual({
      op: 'or',
      args: 'ends_at.gt.2026-06-28,and(ends_at.is.null,starts_at.gte.2026-06-28)',
    })
  })
  it('matches instant and spanning events to the same overlap window', () => {
    const start = '2026-06-28'
    const end = '2026-08-09'
    expect(eventOverlapsRange({
      ...e1,
      starts_at: '2026-06-25T09:00:00Z',
      ends_at: '2026-06-30T09:00:00Z',
    }, start, end)).toBe(true)
    expect(eventOverlapsRange({
      ...e1,
      starts_at: '2026-06-20T09:00:00Z',
      ends_at: '2026-06-27T23:59:59Z',
    }, start, end)).toBe(false)
    expect(eventOverlapsRange({
      ...e1,
      starts_at: '2026-06-20T09:00:00Z',
      ends_at: '2026-06-28T00:00:00Z',
    }, start, end)).toBe(false)
    expect(eventOverlapsRange({
      ...e1,
      starts_at: '2026-08-09T00:00:00Z',
      ends_at: null,
    }, start, end)).toBe(false)
    expect(eventOverlapsRange({
      ...e1,
      starts_at: '2026-08-08T23:59:59Z',
      ends_at: null,
    }, start, end)).toBe(true)
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
