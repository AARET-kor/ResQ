import type { SupabaseClient } from '@supabase/supabase-js'

export interface ImportedCalendarData {
  events: Array<{
    uid: string
    title: string
    starts_at: string
    ends_at: string | null
    location: string | null
  }>
  todos: Array<{
    uid: string
    title: string
    done: boolean
    due_date: string | null
    due_time: string | null
  }>
}

function lines(value: string): string[] {
  return value.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
}

function blocks(value: string[], name: 'VEVENT' | 'VTODO'): string[][] {
  const result: string[][] = []
  let current: string[] | null = null
  for (const line of value) {
    if (line.toUpperCase() === `BEGIN:${name}`) current = []
    else if (line.toUpperCase() === `END:${name}`) {
      if (current) result.push(current)
      current = null
    } else if (current) current.push(line)
  }
  return result
}

function field(block: string[], name: string): string | null {
  const line = block.find((item) => item.split(/[;:]/, 1)[0].toUpperCase() === name)
  if (!line) return null
  const colon = line.indexOf(':')
  return colon >= 0 ? line.slice(colon + 1) : null
}

function text(value: string | null): string {
  return (value ?? '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function date(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/)
  if (!match) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const [, y, m, d, h = '00', minute = '00', second = '00'] = match
  return new Date(Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(h),
    Number(minute),
    Number(second),
  )).toISOString()
}

export function parseICSImport(value: string): ImportedCalendarData {
  const all = lines(value)
  return {
    events: blocks(all, 'VEVENT').flatMap((block) => {
      const uid = field(block, 'UID')
      const startsAt = date(field(block, 'DTSTART'))
      if (!uid || !startsAt || field(block, 'STATUS')?.toUpperCase() === 'CANCELLED') return []
      return [{
        uid,
        title: text(field(block, 'SUMMARY')).trim() || '(제목 없음)',
        starts_at: startsAt,
        ends_at: date(field(block, 'DTEND')),
        location: field(block, 'LOCATION') ? text(field(block, 'LOCATION')) : null,
      }]
    }),
    todos: blocks(all, 'VTODO').flatMap((block) => {
      const uid = field(block, 'UID')
      if (!uid || field(block, 'STATUS')?.toUpperCase() === 'CANCELLED') return []
      const due = date(field(block, 'DUE') ?? field(block, 'DTSTART'))
      return [{
        uid,
        title: text(field(block, 'SUMMARY')).trim() || '(제목 없음)',
        done: field(block, 'STATUS')?.toUpperCase() === 'COMPLETED',
        due_date: due?.slice(0, 10) ?? null,
        due_time: due?.slice(11, 16) ?? null,
      }]
    }),
  }
}

async function contentHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24)
}

export async function importICSFile(
  client: SupabaseClient,
  userId: string,
  name: string,
  value: string,
): Promise<{ events: number; todos: number }> {
  if (value.length > 5_000_000) throw new Error('ICS 파일은 최대 5MB까지 가져올 수 있습니다.')
  const parsed = parseICSImport(value)
  if (parsed.events.length + parsed.todos.length === 0) {
    throw new Error('가져올 일정이나 할 일을 찾지 못했습니다.')
  }
  const sourceId = `file:${await contentHash(value)}`
  const now = new Date().toISOString()
  if (parsed.events.length) {
    const { error: sourceError } = await client.from('integration_sources').upsert({
      user_id: userId,
      provider: 'ics',
      resource_type: 'calendar',
      external_id: sourceId,
      name,
      selected: true,
      is_default: false,
      can_write: false,
      sync_mode: 'read_only',
      metadata: { imported_file: true },
    }, { onConflict: 'user_id,provider,resource_type,external_id' })
    if (sourceError) throw sourceError
    const { error } = await client.from('events').upsert(
      parsed.events.map((event) => ({
        user_id: userId,
        ...event,
        kind: 'other',
        notes: null,
        source_provider: 'ics',
        external_source_id: sourceId,
        external_id: event.uid,
        last_synced_at: now,
        sync_status: 'synced',
      })),
      { onConflict: 'user_id,source_provider,external_source_id,external_id' },
    )
    if (error) throw error
  }
  if (parsed.todos.length) {
    const { error: sourceError } = await client.from('integration_sources').upsert({
      user_id: userId,
      provider: 'ics',
      resource_type: 'task_list',
      external_id: sourceId,
      name: `${name} · Tasks`,
      selected: true,
      is_default: false,
      can_write: false,
      sync_mode: 'read_only',
      metadata: { imported_file: true },
    }, { onConflict: 'user_id,provider,resource_type,external_id' })
    if (sourceError) throw sourceError
    const { error } = await client.from('todos').upsert(
      parsed.todos.map((todo) => ({
        user_id: userId,
        ...todo,
        priority: 'normal',
        source_provider: 'ics',
        external_source_id: sourceId,
        external_id: todo.uid,
        last_synced_at: now,
        sync_status: 'synced',
      })),
      { onConflict: 'user_id,source_provider,external_source_id,external_id' },
    )
    if (error) throw error
  }
  return { events: parsed.events.length, todos: parsed.todos.length }
}
