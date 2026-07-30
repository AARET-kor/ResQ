import type { EventItem, EventKind } from '../../../lib/events'
import {
  PROVIDER_LABEL,
  type IntegrationProvider,
  type IntegrationSource,
  type SyncStatus,
} from '../../../lib/integrations'
import { sourceForItem, type DateDecoration, type PlannerTaskFilter } from '../../../lib/planner'
import {
  PRIORITY_COLOR,
  type Todo,
  type TodoPriority,
} from '../../../lib/todos'

export interface EventDraft {
  title: string
  starts_at: string
  kind: EventKind
  ends_at?: string | null
  location?: string | null
  notes?: string | null
  source_provider?: IntegrationProvider | null
  external_source_id?: string | null
  sync_status?: SyncStatus
}

export interface TodoDraftOptions {
  priority: TodoPriority
  dueDate: string | null
  dueTime: string | null
  sourceProvider?: IntegrationProvider | null
  externalSourceId?: string | null
  syncStatus?: SyncStatus
}

export type PlannerItemSelection =
  | { type: 'event'; event: EventItem }
  | { type: 'todo'; todo: Todo }

/**
 * External items are only editable when they can be matched to a source that
 * PlanPage has positively identified as writable. Missing source metadata must
 * fail closed instead of being mistaken for a local ResQ item.
 */
export function isPlannerItemReadOnly(
  item: EventItem | Todo,
  readOnlySourceKeys: ReadonlySet<string>,
): boolean {
  if (!item.source_provider) return false
  if (!item.external_source_id) return true
  return readOnlySourceKeys.has(
    `${item.source_provider}:${item.external_source_id}`,
  )
}

export const TASK_FILTERS: Array<{ id: PlannerTaskFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'today', label: '오늘' },
  { id: 'scheduled', label: '예정' },
  { id: 'unscheduled', label: '날짜 없음' },
  { id: 'high', label: '중요' },
  { id: 'completed', label: '완료' },
]

export const DECORATIONS: Array<{
  id: DateDecoration
  label: string
  color: string
}> = [
  { id: 'pink', label: '핑크', color: '#ff2d8d' },
  { id: 'green', label: '그린', color: '#22a060' },
  { id: 'blue', label: '블루', color: '#4389ff' },
  { id: 'amber', label: '앰버', color: '#e39520' },
]

export const KIND_COLOR: Record<EventKind, string> = {
  conference: '#238452',
  surgery: '#d05252',
  social: '#d58b1b',
  professor: '#147f7c',
  other: '#8063c7',
}

export const PROVIDER_FALLBACK: Record<IntegrationProvider | 'resq', string> = {
  resq: '#6fff00',
  google: '#4285f4',
  microsoft: '#5b9bd5',
  todoist: '#e44332',
  apple: '#9c9cac',
  android: '#3ddc84',
  ics: '#d89a16',
  caldav: '#a78bfa',
}

export const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

export function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}월 ${Number(day)}일`
}

export function sourceKey(item: EventItem | Todo): string {
  return item.source_provider
    ? `${item.source_provider}:${
      item.external_source_id ?? '__unresolved__'
    }`
    : 'resq'
}

export function eventColor(
  event: EventItem,
  sources: IntegrationSource[],
): string {
  return sourceForItem(event, sources)?.color
    ?? (event.source_provider
      ? PROVIDER_FALLBACK[event.source_provider]
      : KIND_COLOR[event.kind])
}

export function sourceLabel(
  item: EventItem | Todo,
  sources: IntegrationSource[],
): string {
  return sourceForItem(item, sources)?.name
    ?? (item.source_provider ? PROVIDER_LABEL[item.source_provider] : 'ResQ')
}

export function todoColor(todo: Todo): string {
  return PRIORITY_COLOR[todo.priority]
}
