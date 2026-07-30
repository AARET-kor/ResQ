import {
  Circle,
  Clock3,
  ListTodo,
  Palette,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import type { EventItem } from '../../lib/events'
import {
  type IntegrationProvider,
  type IntegrationSource,
} from '../../lib/integrations'
import {
  addDaysISO,
  eventOccursOnDate,
  itemMatchesProvider,
  todayKst,
  weekDates,
  type DateDecoration,
  type PlannerProviderFilter,
  type PlannerView,
} from '../../lib/planner'
import type { Todo } from '../../lib/todos'
import { LiquidGlass } from '../LiquidGlass'
import { PlannerAgendaView } from './planner/PlannerAgendaView'
import { PlannerHeader } from './planner/PlannerHeader'
import { PlannerMonthView } from './planner/PlannerMonthView'
import {
  PlannerQuickCapture,
  type PlannerCaptureType,
} from './planner/PlannerQuickCapture'
import { PlannerTasksView } from './planner/PlannerTasksView'
import { PlannerWeekView } from './planner/PlannerWeekView'
import {
  DECORATIONS,
  shortDate,
  type EventDraft,
  type TodoDraftOptions,
} from './planner/workstationShared'

interface PlannerPreferences {
  view: PlannerView
  provider: PlannerProviderFilter
  decorations: Record<string, DateDecoration>
}

interface CaptureSession {
  type: PlannerCaptureType
  date: string
}

export interface PlanWorkstationProps {
  userId: string
  events: EventItem[]
  todos: Todo[]
  sources: IntegrationSource[]
  year: number
  month0: number
  onMonthChange: (year: number, month0: number) => void
  onAddEvent: (event: EventDraft) => boolean | void | Promise<boolean | void>
  onAddTodo: (
    title: string,
    options: TodoDraftOptions,
  ) => boolean | void | Promise<boolean | void>
  onToggleTodo: (todo: Todo) => void
  addingEvent?: boolean
  addingTodo?: boolean
  pendingTodoIds?: Set<string>
  readOnlySourceKeys?: Set<string>
}

function loadPreferences(userId: string): PlannerPreferences {
  const fallback: PlannerPreferences = {
    view: 'month',
    provider: 'all',
    decorations: {},
  }
  if (typeof window === 'undefined') return fallback
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`resq:planner:${userId}`) ?? 'null',
    ) as Partial<PlannerPreferences> | null
    if (!stored) return fallback
    return {
      view: ['month', 'week', 'agenda', 'tasks'].includes(stored.view ?? '')
        ? stored.view!
        : fallback.view,
      provider: typeof stored.provider === 'string'
        ? stored.provider
        : fallback.provider,
      decorations: stored.decorations && typeof stored.decorations === 'object'
        ? stored.decorations
        : {},
    }
  } catch {
    return fallback
  }
}

function monthLabel(year: number, month0: number): string {
  return `${year}년 ${month0 + 1}월`
}

export function PlanWorkstation({
  userId,
  events,
  todos,
  sources,
  year,
  month0,
  onMonthChange,
  onAddEvent,
  onAddTodo,
  onToggleTodo,
  addingEvent = false,
  addingTodo = false,
  pendingTodoIds = new Set<string>(),
  readOnlySourceKeys = new Set<string>(),
}: PlanWorkstationProps) {
  const initial = useMemo(() => loadPreferences(userId), [userId])
  const [view, setView] = useState<PlannerView>(initial.view)
  const [providerFilter, setProviderFilter] = useState<PlannerProviderFilter>(
    initial.provider,
  )
  const [decorations, setDecorations] = useState<Record<string, DateDecoration>>(
    initial.decorations,
  )
  const [selectedDate, setSelectedDate] = useState(todayKst)
  const [query, setQuery] = useState('')
  const [capture, setCapture] = useState<CaptureSession | null>(null)
  const [decorationOpen, setDecorationOpen] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `resq:planner:${userId}`,
        JSON.stringify({ view, provider: providerFilter, decorations }),
      )
    } catch {
      // Preferences are optional; the planner stays usable when storage is off.
    }
  }, [decorations, providerFilter, userId, view])

  useEffect(() => {
    const displayedPrefix = `${year}-${String(month0 + 1).padStart(2, '0')}`
    if (!selectedDate.startsWith(displayedPrefix)) {
      setSelectedDate(`${displayedPrefix}-01`)
    }
  }, [month0, selectedDate, year])

  const selectedSources = sources.filter((source) => source.selected)
  const providers = Array.from(new Set<IntegrationProvider>([
    ...selectedSources.map((source) => source.provider),
    ...events.flatMap((event) =>
      event.source_provider ? [event.source_provider] : []),
    ...todos.flatMap((todo) =>
      todo.source_provider ? [todo.source_provider] : []),
  ]))
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
  const matchesQuery = (title: string) =>
    !normalizedQuery
    || title.toLocaleLowerCase('ko-KR').includes(normalizedQuery)
  const visibleEvents = events.filter((event) =>
    itemMatchesProvider(event, providerFilter) && matchesQuery(event.title),
  )
  const visibleTodos = todos.filter((todo) =>
    itemMatchesProvider(todo, providerFilter) && matchesQuery(todo.title),
  )
  const selectedWeek = weekDates(selectedDate)

  const selectDate = (date: string) => {
    setSelectedDate(date)
    const [nextYear, nextMonth] = date.split('-').map(Number)
    if (nextYear !== year || nextMonth - 1 !== month0) {
      onMonthChange(nextYear, nextMonth - 1)
    }
  }

  const openCapture = (
    type: PlannerCaptureType,
    date = selectedDate,
  ) => {
    setCapture({ type, date })
  }

  const goToday = () => {
    const today = todayKst()
    const [nextYear, nextMonth] = today.split('-').map(Number)
    setSelectedDate(today)
    onMonthChange(nextYear, nextMonth - 1)
  }

  const navigate = (direction: -1 | 1) => {
    if (view === 'week') {
      selectDate(addDaysISO(selectedDate, direction * 7))
      return
    }
    const target = new Date(Date.UTC(year, month0 + direction, 1))
    const nextYear = target.getUTCFullYear()
    const nextMonth0 = target.getUTCMonth()
    setSelectedDate(
      `${nextYear}-${String(nextMonth0 + 1).padStart(2, '0')}-01`,
    )
    onMonthChange(nextYear, nextMonth0)
  }

  const setDecoration = (decoration: DateDecoration | null) => {
    setDecorations((current) => {
      const next = { ...current }
      if (decoration) next[selectedDate] = decoration
      else delete next[selectedDate]
      return next
    })
    setDecorationOpen(false)
  }

  return (
    <LiquidGlass className="plan-card planner-workstation">
      <div className="planner-shell">
        <PlannerHeader
          view={view}
          periodLabel={view === 'week'
            ? `${shortDate(selectedWeek[0])} – ${shortDate(selectedWeek[6])}`
            : monthLabel(year, month0)}
          query={query}
          providerFilter={providerFilter}
          providers={providers}
          onViewChange={setView}
          onQueryChange={setQuery}
          onProviderChange={setProviderFilter}
          onNavigate={navigate}
          onToday={goToday}
          onQuickAdd={() =>
            openCapture(view === 'tasks' ? 'todo' : 'event')}
        />

        {capture && (
          <PlannerQuickCapture
            initialType={capture.type}
            initialDate={capture.date}
            selectedSources={selectedSources}
            addingEvent={addingEvent}
            addingTodo={addingTodo}
            onAddEvent={onAddEvent}
            onAddTodo={onAddTodo}
            onClose={() => setCapture(null)}
          />
        )}

        {view === 'month' && (
          <PlannerMonthView
            year={year}
            month0={month0}
            events={visibleEvents}
            todos={visibleTodos}
            sources={sources}
            selectedDate={selectedDate}
            decorations={decorations}
            onSelectDate={selectDate}
            onOpenCapture={openCapture}
          />
        )}

        {view === 'week' && (
          <PlannerWeekView
            selectedDate={selectedDate}
            events={visibleEvents}
            todos={visibleTodos}
            sources={sources}
            decorations={decorations}
            onSelectDate={selectDate}
            onOpenCapture={openCapture}
            onToggleTodo={onToggleTodo}
            pendingTodoIds={pendingTodoIds}
            readOnlySourceKeys={readOnlySourceKeys}
          />
        )}

        {view === 'agenda' && (
          <PlannerAgendaView
            visibleEvents={visibleEvents}
            visibleTodos={visibleTodos}
            sources={sources}
            readOnlySourceKeys={readOnlySourceKeys}
            pendingTodoIds={pendingTodoIds}
            onToggleTodo={onToggleTodo}
          />
        )}

        {view === 'tasks' && (
          <PlannerTasksView
            todos={visibleTodos}
            sources={sources}
            readOnlySourceKeys={readOnlySourceKeys}
            pendingTodoIds={pendingTodoIds}
            onToggleTodo={onToggleTodo}
            onAddTodo={() => openCapture('todo')}
          />
        )}

        <footer className="planner-footer">
          <div className="planner-selected-date">
            <Circle aria-hidden size={9} />
            <strong>{shortDate(selectedDate)}</strong>
            <span>
              일정 {visibleEvents.filter((event) =>
                eventOccursOnDate(event, selectedDate)).length}
              {' · '}
              할 일 {visibleTodos.filter((todo) =>
                todo.due_date === selectedDate && !todo.done).length}
            </span>
          </div>
          <div className="planner-footer__actions">
            <div className="planner-decoration-control">
              <button
                type="button"
                aria-expanded={decorationOpen}
                onClick={() => setDecorationOpen((open) => !open)}
                className="resq-secondary-button"
              >
                <Palette aria-hidden size={15} />
                날짜 강조
              </button>
              {decorationOpen && (
                <div
                  className="planner-decoration-menu"
                  aria-label="날짜 강조 색상"
                >
                  {DECORATIONS.map((decoration) => (
                    <button
                      key={decoration.id}
                      type="button"
                      aria-label={`${decoration.label} 강조`}
                      aria-pressed={
                        decorations[selectedDate] === decoration.id
                      }
                      onClick={() => setDecoration(decoration.id)}
                      style={{
                        '--decoration-color': decoration.color,
                      } as CSSProperties}
                    >
                      <Circle aria-hidden size={10} />
                      {decoration.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setDecoration(null)}>
                    <X aria-hidden size={13} />
                    지우기
                  </button>
                  <p>강조 표시는 현재 기기에 저장됩니다.</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => openCapture('todo')}
              className="resq-secondary-button"
            >
              <ListTodo aria-hidden size={15} />
              할 일
            </button>
            <button
              type="button"
              onClick={() => openCapture('event')}
              className="resq-secondary-button"
            >
              <Clock3 aria-hidden size={15} />
              일정
            </button>
          </div>
        </footer>
      </div>
    </LiquidGlass>
  )
}
