import { describe, expect, it } from 'vitest'
import type { EventItem } from './events'
import {
  addDaysISO,
  buildPlannerAgenda,
  eventDisplayRange,
  eventOccursOnDate,
  eventOccursInDateRange,
  filterPlannerTodos,
  kstDateISO,
  weekDates,
} from './planner'
import type { Todo } from './todos'

const event = (overrides: Partial<EventItem> = {}): EventItem => ({
  id: 'event-1',
  user_id: 'user-1',
  title: '학회',
  starts_at: '2026-07-20T09:00:00+09:00',
  ends_at: null,
  kind: 'conference',
  location: null,
  notes: null,
  ...overrides,
})

const todo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  user_id: 'user-1',
  title: '초록 제출',
  done: false,
  due_date: '2026-07-21',
  due_time: '17:00',
  xp_granted: false,
  priority: 'high',
  ...overrides,
})

describe('planner date helpers', () => {
  it('formats timezone-aware dates in Korea time', () => {
    expect(kstDateISO('2026-07-19T15:00:00.000Z')).toBe('2026-07-20')
  })

  it('moves ISO dates without local DST drift', () => {
    expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01')
  })

  it('returns a Sunday-first week', () => {
    expect(weekDates('2026-07-30')).toEqual([
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ])
  })
})

describe('planner events and tasks', () => {
  it('renders timed multi-day events through their inclusive end date', () => {
    const span = event({ ends_at: '2026-07-23T09:00:00+09:00' })
    expect(eventDisplayRange(span)).toEqual({
      startDate: '2026-07-20',
      endDate: '2026-07-23',
    })
    expect(eventOccursOnDate(span, '2026-07-22')).toBe(true)
    expect(eventOccursOnDate(span, '2026-07-24')).toBe(false)
  })

  it('treats midnight-to-midnight all-day end dates as exclusive', () => {
    const span = event({
      starts_at: '2026-07-20T00:00:00+09:00',
      ends_at: '2026-07-23T00:00:00+09:00',
    })
    expect(eventDisplayRange(span).endDate).toBe('2026-07-22')
  })

  it('includes events spanning into a month but excludes adjacent-only events', () => {
    expect(eventOccursInDateRange(event({
      starts_at: '2026-06-28T09:00:00+09:00',
      ends_at: '2026-07-02T09:00:00+09:00',
    }), '2026-07-01', '2026-08-01')).toBe(true)
    expect(eventOccursInDateRange(event({
      starts_at: '2026-08-01T09:00:00+09:00',
      ends_at: null,
    }), '2026-07-01', '2026-08-01')).toBe(false)
  })

  it('builds a single chronological agenda from events and tasks', () => {
    const agenda = buildPlannerAgenda(
      [event()],
      [todo()],
    )
    expect(agenda.map((item) => item.type)).toEqual(['event', 'todo'])
  })

  it('supports smart task filters', () => {
    const rows = [
      todo(),
      todo({ id: 'two', priority: 'normal', due_date: null }),
      todo({ id: 'three', done: true }),
    ]
    expect(filterPlannerTodos(rows, 'high').map((item) => item.id)).toEqual(['todo-1'])
    expect(filterPlannerTodos(rows, 'unscheduled').map((item) => item.id)).toEqual(['two'])
    expect(filterPlannerTodos(rows, 'completed').map((item) => item.id)).toEqual(['three'])
  })
})
