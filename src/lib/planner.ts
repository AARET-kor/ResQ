import type { EventItem } from './events'
import type { IntegrationProvider, IntegrationSource } from './integrations'
import type { Todo, TodoPriority } from './todos'

export type PlannerView = 'month' | 'week' | 'agenda' | 'tasks'
export type PlannerProviderFilter = 'all' | 'resq' | IntegrationProvider
export type PlannerTaskFilter =
  | 'all'
  | 'today'
  | 'scheduled'
  | 'unscheduled'
  | 'high'
  | 'completed'

export type DateDecoration = 'pink' | 'green' | 'blue' | 'amber'

export interface PlannerAgendaItem {
  key: string
  type: 'event' | 'todo'
  title: string
  date: string | null
  time: string | null
  provider: IntegrationProvider | 'resq'
  sourceId: string | null
  done: boolean
  priority: TodoPriority | null
  event: EventItem | null
  todo: Todo | null
}

const KST_DATE_FORMAT = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const KST_TIME_FORMAT = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formattedParts(
  formatter: Intl.DateTimeFormat,
  value: string | Date,
): Record<string, string> | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
}

export function kstDateISO(value: string | Date): string {
  const parts = formattedParts(KST_DATE_FORMAT, value)
  if (!parts) return typeof value === 'string' ? value.slice(0, 10) : ''
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function kstTimeHHMM(value: string): string {
  const parts = formattedParts(KST_TIME_FORMAT, value)
  if (!parts) return value.slice(11, 16)
  return `${parts.hour}:${parts.minute}`
}

export function todayKst(now = new Date()): string {
  return kstDateISO(now)
}

export function addDaysISO(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days, 12))
  return date.toISOString().slice(0, 10)
}

export function weekDates(anchor: string): string[] {
  const [year, month, day] = anchor.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  const sunday = addDaysISO(anchor, -date.getUTCDay())
  return Array.from({ length: 7 }, (_, index) => addDaysISO(sunday, index))
}

export function eventDisplayRange(event: EventItem): {
  startDate: string
  endDate: string
} {
  const startDate = kstDateISO(event.starts_at)
  if (!event.ends_at) return { startDate, endDate: startDate }

  let endDate = kstDateISO(event.ends_at)
  const startsAtMidnight = kstTimeHHMM(event.starts_at) === '00:00'
  const endsAtMidnight = kstTimeHHMM(event.ends_at) === '00:00'

  // Google and CalDAV represent all-day end dates as exclusive. The current
  // schema does not preserve an all-day flag, so midnight-to-midnight spans
  // use the interoperable exclusive-end convention.
  if (startsAtMidnight && endsAtMidnight && endDate > startDate) {
    endDate = addDaysISO(endDate, -1)
  }

  return {
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
  }
}

export function eventOccursOnDate(event: EventItem, date: string): boolean {
  const range = eventDisplayRange(event)
  return date >= range.startDate && date <= range.endDate
}

export function eventOccursInDateRange(
  event: EventItem,
  startDate: string,
  endDateExclusive: string,
): boolean {
  const range = eventDisplayRange(event)
  return range.startDate < endDateExclusive && range.endDate >= startDate
}

export function eventIsMultiDay(event: EventItem): boolean {
  const range = eventDisplayRange(event)
  return range.endDate > range.startDate
}

export function providerForItem(
  item: EventItem | Todo,
): IntegrationProvider | 'resq' {
  return item.source_provider ?? 'resq'
}

export function sourceForItem(
  item: EventItem | Todo,
  sources: IntegrationSource[],
): IntegrationSource | undefined {
  return sources.find(
    (source) => source.provider === item.source_provider
      && source.external_id === item.external_source_id,
  )
}

export function itemMatchesProvider(
  item: EventItem | Todo,
  provider: PlannerProviderFilter,
): boolean {
  if (provider === 'all') return true
  return providerForItem(item) === provider
}

export function filterPlannerTodos(
  todos: Todo[],
  filter: PlannerTaskFilter,
  today = todayKst(),
): Todo[] {
  return todos.filter((todo) => {
    if (filter === 'today') return !todo.done && todo.due_date === today
    if (filter === 'scheduled') return !todo.done && Boolean(todo.due_date)
    if (filter === 'unscheduled') return !todo.done && !todo.due_date
    if (filter === 'high') return !todo.done && todo.priority === 'high'
    if (filter === 'completed') return todo.done
    return !todo.done
  })
}

export function buildPlannerAgenda(
  events: EventItem[],
  todos: Todo[],
): PlannerAgendaItem[] {
  return [
    ...events.map((event): PlannerAgendaItem => ({
      key: `event:${event.id}`,
      type: 'event',
      title: event.title,
      date: kstDateISO(event.starts_at),
      time: kstTimeHHMM(event.starts_at),
      provider: providerForItem(event),
      sourceId: event.external_source_id ?? null,
      done: false,
      priority: null,
      event,
      todo: null,
    })),
    ...todos.map((todo): PlannerAgendaItem => ({
      key: `todo:${todo.id}`,
      type: 'todo',
      title: todo.title,
      date: todo.due_date,
      time: todo.due_time,
      provider: providerForItem(todo),
      sourceId: todo.external_source_id ?? null,
      done: todo.done,
      priority: todo.priority,
      event: null,
      todo,
    })),
  ].sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title, 'ko')
    if (!a.date) return 1
    if (!b.date) return -1
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return (a.time ?? '23:59').localeCompare(b.time ?? '23:59')
  })
}
