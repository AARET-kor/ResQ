import type { EventItem } from './events'
import type { Todo } from './todos'

/** RFC5545 text escaping for SUMMARY/LOCATION/DESCRIPTION values. */
export function escapeICS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

const HOUR_MS = 3_600_000

/**
 * Build an iCalendar document from events (+30min alarm; conferences also get a
 * day-before alarm) and due-dated, not-done todos (all-day "[할일]" entries).
 * Consumed by the .ics download and the calendar-feed subscription function.
 */
export function buildICS(events: EventItem[], todos: Todo[]): string {
  const now = utcStamp(new Date().toISOString())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ResQ//KR',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:ResQ',
  ]
  for (const e of events) {
    const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + HOUR_MS).toISOString()
    lines.push(
      'BEGIN:VEVENT',
      `UID:resq-ev-${e.id}`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(e.starts_at)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeICS(e.title)}`,
    )
    if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`)
    if (e.notes) lines.push(`DESCRIPTION:${escapeICS(e.notes)}`)
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:ResQ', 'TRIGGER:-PT30M', 'END:VALARM')
    if (e.kind === 'conference') {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:ResQ', 'TRIGGER:-P1D', 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  for (const t of todos) {
    if (t.done || !t.due_date) continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:resq-todo-${t.id}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${t.due_date.replace(/-/g, '')}`,
      `SUMMARY:${escapeICS(`[할일] ${t.title}`)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
