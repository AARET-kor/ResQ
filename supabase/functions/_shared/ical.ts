export interface ParsedCalendarEvent {
  uid: string
  title: string
  startsAt: string
  endsAt: string | null
  location: string | null
  updatedAt: string | null
  cancelled: boolean
}

export interface ParsedCalendarTask {
  uid: string
  title: string
  dueAt: string | null
  completed: boolean
  updatedAt: string | null
  cancelled: boolean
}

function unfold(value: string): string[] {
  return value
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function property(
  lines: string[],
  name: string,
): { value: string; params: Record<string, string> } | null {
  const prefix = `${name.toUpperCase()}`
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const left = line.slice(0, colon)
    const [propertyName, ...parts] = left.split(';')
    if (propertyName.toUpperCase() !== prefix) continue
    const params: Record<string, string> = {}
    for (const part of parts) {
      const equal = part.indexOf('=')
      if (equal > 0) params[part.slice(0, equal).toUpperCase()] = part.slice(equal + 1)
    }
    return { value: line.slice(colon + 1), params }
  }
  return null
}

function zonedIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): string {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second)
  let guess = desired
  for (let attempt = 0; attempt < 2; attempt++) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    )
    const displayed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    )
    guess += desired - displayed
  }
  return new Date(guess).toISOString()
}

function parseDate(
  item: { value: string; params: Record<string, string> } | null,
): string | null {
  if (!item) return null
  const value = item.value.trim()
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/,
  )
  if (!match) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const [, y, m, d, h = '00', min = '00', sec = '00', z] = match
  if (z) {
    return new Date(Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      Number(sec),
    )).toISOString()
  }
  const timeZone = item.params.TZID
  if (timeZone) {
    try {
      return zonedIso(
        Number(y),
        Number(m),
        Number(d),
        Number(h),
        Number(min),
        Number(sec),
        timeZone,
      )
    } catch {
      // Invalid TZID: preserve the wall time as UTC rather than dropping data.
    }
  }
  return new Date(Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(h),
    Number(min),
    Number(sec),
  )).toISOString()
}

function components(lines: string[], name: 'VEVENT' | 'VTODO'): string[][] {
  const result: string[][] = []
  let current: string[] | null = null
  for (const line of lines) {
    if (line.toUpperCase() === `BEGIN:${name}`) {
      current = []
    } else if (line.toUpperCase() === `END:${name}`) {
      if (current) result.push(current)
      current = null
    } else if (current) {
      current.push(line)
    }
  }
  return result
}

export function parseCalendar(value: string): {
  events: ParsedCalendarEvent[]
  tasks: ParsedCalendarTask[]
} {
  const lines = unfold(value)
  const events = components(lines, 'VEVENT').flatMap((block) => {
    const uid = property(block, 'UID')?.value.trim()
    const startsAt = parseDate(property(block, 'DTSTART'))
    if (!uid || !startsAt) return []
    const end = parseDate(property(block, 'DTEND'))
    return [{
      uid,
      title: unescapeText(property(block, 'SUMMARY')?.value ?? '').trim() || '(제목 없음)',
      startsAt,
      endsAt: end,
      location: property(block, 'LOCATION')
        ? unescapeText(property(block, 'LOCATION')!.value)
        : null,
      updatedAt: parseDate(property(block, 'LAST-MODIFIED') ?? property(block, 'DTSTAMP')),
      cancelled: property(block, 'STATUS')?.value.toUpperCase() === 'CANCELLED',
    }]
  })
  const tasks = components(lines, 'VTODO').flatMap((block) => {
    const uid = property(block, 'UID')?.value.trim()
    if (!uid) return []
    const status = property(block, 'STATUS')?.value.toUpperCase()
    return [{
      uid,
      title: unescapeText(property(block, 'SUMMARY')?.value ?? '').trim() || '(제목 없음)',
      dueAt: parseDate(property(block, 'DUE') ?? property(block, 'DTSTART')),
      completed: status === 'COMPLETED',
      updatedAt: parseDate(property(block, 'LAST-MODIFIED') ?? property(block, 'DTSTAMP')),
      cancelled: status === 'CANCELLED',
    }]
  })
  return { events, tasks }
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function compactUtc(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function buildEventCalendar(event: {
  uid: string
  title: string
  startsAt: string
  endsAt: string | null
  location: string | null
}): string {
  const end = event.endsAt
    ?? new Date(new Date(event.startsAt).getTime() + 3_600_000).toISOString()
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ResQ//Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${compactUtc(new Date().toISOString())}`,
    `DTSTART:${compactUtc(event.startsAt)}`,
    `DTEND:${compactUtc(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function buildTaskCalendar(task: {
  uid: string
  title: string
  dueAt: string | null
  completed: boolean
}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ResQ//Task Sync//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTODO',
    `UID:${escapeText(task.uid)}`,
    `DTSTAMP:${compactUtc(new Date().toISOString())}`,
    `SUMMARY:${escapeText(task.title)}`,
    ...(task.dueAt ? [`DUE:${compactUtc(task.dueAt)}`] : []),
    `STATUS:${task.completed ? 'COMPLETED' : 'NEEDS-ACTION'}`,
    ...(task.completed ? [`COMPLETED:${compactUtc(new Date().toISOString())}`] : []),
    'END:VTODO',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
