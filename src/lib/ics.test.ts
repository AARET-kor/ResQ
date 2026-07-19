import { describe, it, expect } from 'vitest'
import { buildICS, escapeICS } from './ics'
import type { EventItem } from './events'
import type { Todo } from './todos'

const ev: EventItem = {
  id: 'e1', user_id: 'u1', title: '대한성형외과학회; 춘계, 등록', starts_at: '2026-08-20T09:00:00+09:00',
  ends_at: null, kind: 'conference', location: '코엑스', notes: null,
}
const todo: Todo = {
  id: 't1', user_id: 'u1', title: '초록 제출', done: false, due_date: '2026-08-01', xp_granted: false,
  priority: 'normal', due_time: null,
}
const doneTodo: Todo = { ...todo, id: 't2', done: true }
const noDueTodo: Todo = { ...todo, id: 't3', due_date: null }

describe('escapeICS', () => {
  it('escapes commas, semicolons and newlines', () => {
    expect(escapeICS('a,b;c\nd')).toBe('a\\,b\\;c\\nd')
  })
})

describe('buildICS', () => {
  const ics = buildICS([ev], [todo, doneTodo, noDueTodo])
  it('is a valid VCALENDAR wrapper', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('PRODID:-//ResQ//KR')
  })
  it('renders the event with UTC times, alarm and escaped summary', () => {
    expect(ics).toContain('UID:resq-ev-e1')
    expect(ics).toContain('DTSTART:20260820T000000Z') // 09:00 KST = 00:00 UTC
    expect(ics).toContain('SUMMARY:대한성형외과학회\\; 춘계\\, 등록')
    expect(ics).toContain('LOCATION:코엑스')
    expect(ics).toContain('TRIGGER:-PT30M')
  })
  it('adds a day-before alarm for conferences', () => {
    expect(ics).toContain('TRIGGER:-P1D')
  })
  it('renders only not-done, due-dated todos as all-day [할일] events', () => {
    expect(ics).toContain('UID:resq-todo-t1')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260801')
    expect(ics).toContain('SUMMARY:[할일] 초록 제출')
    expect(ics).not.toContain('resq-todo-t2')
    expect(ics).not.toContain('resq-todo-t3')
  })
  it('uses CRLF line endings', () => {
    expect(ics).toContain('\r\n')
  })
})
