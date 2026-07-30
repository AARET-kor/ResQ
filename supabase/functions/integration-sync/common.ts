import { dbRows, dbWrite, type JsonRecord } from '../_shared/integration.ts'

export interface Source extends JsonRecord {
  id: string
  connection_id: string
  provider: string
  external_id: string
  resource_type: 'calendar' | 'task_list'
  selected: boolean
  is_default: boolean
  can_write: boolean
  sync_mode: 'read_only' | 'two_way'
  sync_token: string | null
  last_synced_at: string | null
}

export interface SyncResult {
  importedEvents: number
  importedTasks: number
  pushedEvents: number
  pushedTasks: number
  deletedEvents: number
  deletedTasks: number
  sources: number
}

export function emptyResult(sources = 0): SyncResult {
  return {
    importedEvents: 0,
    importedTasks: 0,
    pushedEvents: 0,
    pushedTasks: 0,
    deletedEvents: 0,
    deletedTasks: 0,
    sources,
  }
}

export function mergeResult(target: SyncResult, next: Partial<SyncResult>): SyncResult {
  target.importedEvents += next.importedEvents ?? 0
  target.importedTasks += next.importedTasks ?? 0
  target.pushedEvents += next.pushedEvents ?? 0
  target.pushedTasks += next.pushedTasks ?? 0
  target.deletedEvents += next.deletedEvents ?? 0
  target.deletedTasks += next.deletedTasks ?? 0
  return target
}

export function syncWindow(now = new Date()): { start: string; end: string } {
  const start = new Date(now)
  const end = new Date(now)
  start.setDate(start.getDate() - 90)
  end.setFullYear(end.getFullYear() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function selectedSources(
  userId: string,
  provider: string,
): Promise<Source[]> {
  return await dbRows(
    `integration_sources?user_id=eq.${encodeURIComponent(userId)}` +
    `&provider=eq.${encodeURIComponent(provider)}&selected=eq.true&select=*`,
  ) as Source[]
}

export async function markSourceSynced(
  source: Source,
  values: { sync_token?: string | null; metadata?: JsonRecord } = {},
): Promise<void> {
  await dbWrite(
    `integration_sources?id=eq.${encodeURIComponent(source.id)}`,
    'PATCH',
    {
      last_synced_at: new Date().toISOString(),
      last_error: null,
      ...(values.sync_token !== undefined ? { sync_token: values.sync_token } : {}),
      ...(values.metadata !== undefined ? { metadata: values.metadata } : {}),
    },
  )
}

export async function markRowError(table: 'events' | 'todos', id: string): Promise<void> {
  await dbWrite(
    `${table}?id=eq.${encodeURIComponent(id)}`,
    'PATCH',
    { sync_status: 'error' },
  )
}

export function dateOnly(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null
}

export function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
