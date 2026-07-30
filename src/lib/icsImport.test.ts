import { describe, expect, it } from 'vitest'
import { parseICSImport } from './icsImport'

describe('parseICSImport', () => {
  it('parses VEVENT and VTODO records', () => {
    const parsed = parseICSImport([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:event-1',
      'DTSTART:20260728T010000Z',
      'DTEND:20260728T020000Z',
      'SUMMARY:Conference\\, Seoul',
      'LOCATION:COEX',
      'END:VEVENT',
      'BEGIN:VTODO',
      'UID:task-1',
      'DUE:20260729T090000Z',
      'SUMMARY:Submit abstract',
      'STATUS:NEEDS-ACTION',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\r\n'))
    expect(parsed.events).toEqual([expect.objectContaining({
      uid: 'event-1',
      title: 'Conference, Seoul',
      starts_at: '2026-07-28T01:00:00.000Z',
    })])
    expect(parsed.todos).toEqual([expect.objectContaining({
      uid: 'task-1',
      due_date: '2026-07-29',
      done: false,
    })])
  })

  it('ignores cancelled and malformed records', () => {
    const parsed = parseICSImport([
      'BEGIN:VEVENT',
      'UID:event-1',
      'STATUS:CANCELLED',
      'DTSTART:20260728T010000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:event-2',
      'END:VEVENT',
    ].join('\n'))
    expect(parsed.events).toEqual([])
  })
})
