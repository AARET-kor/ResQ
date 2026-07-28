import type { EventItem } from './events'
import type {
  IntegrationProvider,
  IntegrationSource,
  IntegrationSyncMode,
} from './integrations'
import type { Todo } from './todos'

export type TimelineItemType = 'event' | 'todo'

export interface UnifiedTimelineItem {
  key: string
  type: TimelineItemType
  sourceId: string
  title: string
  at: string | null
  done: boolean
  provider: IntegrationProvider | 'resq'
  providerLabel: string
  color: string
  externalUrl: string | null
  syncMode: IntegrationSyncMode
  duplicateCount: number
  duplicateProviders: Array<IntegrationProvider | 'resq'>
}

const FALLBACK_COLOR: Record<IntegrationProvider | 'resq', string> = {
  resq: '#6FFF00',
  google: '#4285F4',
  microsoft: '#5B9BD5',
  todoist: '#E44332',
  apple: '#D8D8E8',
  android: '#3DDC84',
  ics: '#F6C85F',
  caldav: '#A78BFA',
}

const LABEL: Record<IntegrationProvider | 'resq', string> = {
  resq: 'ResQ',
  google: 'Google',
  microsoft: 'Outlook',
  todoist: 'Todoist',
  apple: 'Apple',
  android: 'Galaxy',
  ics: 'ICS',
  caldav: 'CalDAV',
}

export function normalizeTimelineTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function sourceFor(
  provider: IntegrationProvider | null | undefined,
  externalSourceId: string | null | undefined,
  sources: IntegrationSource[],
): IntegrationSource | undefined {
  return sources.find(
    (source) => source.provider === provider && source.external_id === externalSourceId,
  )
}

function eventKey(event: EventItem): string {
  return `event:${normalizeTimelineTitle(event.title)}`
}

function todoKey(todo: Todo): string {
  return `todo:${normalizeTimelineTitle(todo.title)}:${todo.due_date ?? 'none'}`
}

export function buildUnifiedTimeline(
  events: EventItem[],
  todos: Todo[],
  sources: IntegrationSource[],
): UnifiedTimelineItem[] {
  const raw: Array<UnifiedTimelineItem & { duplicateKey: string; updatedAt: string }> = [
    ...events.map((event) => {
      const provider: IntegrationProvider | 'resq' = event.source_provider ?? 'resq'
      const source = sourceFor(event.source_provider, event.external_source_id, sources)
      return {
        key: `event:${event.id}`,
        sourceId: event.id,
        type: 'event' as const,
        title: event.title,
        at: event.starts_at,
        done: false,
        provider,
        providerLabel: LABEL[provider],
        color: source?.color ?? FALLBACK_COLOR[provider],
        externalUrl: event.external_url ?? null,
        syncMode: source?.sync_mode ?? 'two_way',
        duplicateCount: 1,
        duplicateProviders: [provider],
        duplicateKey: eventKey(event),
        updatedAt: event.external_updated_at ?? event.updated_at ?? event.starts_at,
      }
    }),
    ...todos.map((todo) => {
      const provider: IntegrationProvider | 'resq' = todo.source_provider ?? 'resq'
      const source = sourceFor(todo.source_provider, todo.external_source_id, sources)
      return {
        key: `todo:${todo.id}`,
        sourceId: todo.id,
        type: 'todo' as const,
        title: todo.title,
        at: todo.due_date
          ? `${todo.due_date}T${todo.due_time ?? '23:59'}:00`
          : null,
        done: todo.done,
        provider,
        providerLabel: LABEL[provider],
        color: source?.color ?? FALLBACK_COLOR[provider],
        externalUrl: todo.external_url ?? null,
        syncMode: source?.sync_mode ?? 'two_way',
        duplicateCount: 1,
        duplicateProviders: [provider],
        duplicateKey: todoKey(todo),
        updatedAt: todo.external_updated_at ?? todo.updated_at ?? todo.due_date ?? '',
      }
    }),
  ]

  const grouped: Array<typeof raw> = []
  for (const item of raw) {
    const matching = grouped.find((group) => {
      const first = group[0]
      if (first.duplicateKey !== item.duplicateKey) return false
      if (item.type === 'todo') return first.at === item.at
      if (!first.at || !item.at) return false
      return Math.abs(new Date(first.at).getTime() - new Date(item.at).getTime()) <= 10 * 60_000
    })
    if (matching) matching.push(item)
    else grouped.push([item])
  }
  const collapsed = grouped.map((items) => {
    const ordered = [...items].sort((a, b) => {
      if (a.provider === 'resq' && b.provider !== 'resq') return -1
      if (b.provider === 'resq' && a.provider !== 'resq') return 1
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    const canonical = ordered[0]
    return {
      ...canonical,
      duplicateCount: items.length,
      duplicateProviders: [...new Set(items.map((item) => item.provider))],
      externalUrl: ordered.find((item) => item.externalUrl)?.externalUrl ?? null,
    }
  })
  return collapsed
    .sort((a, b) => {
      if (!a.at && !b.at) return a.title.localeCompare(b.title, 'ko')
      if (!a.at) return 1
      if (!b.at) return -1
      return a.at.localeCompare(b.at)
    })
    .map(({ duplicateKey: _duplicateKey, updatedAt: _updatedAt, ...item }) => item)
}

export function providerColor(provider: IntegrationProvider | 'resq'): string {
  return FALLBACK_COLOR[provider]
}
