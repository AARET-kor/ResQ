import { Plus } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { EventItem } from '../../../lib/events'
import type { IntegrationSource } from '../../../lib/integrations'
import {
  eventOccursOnDate,
  kstTimeHHMM,
  weekDates,
  type DateDecoration,
} from '../../../lib/planner'
import { PRIORITY_COLOR, type Todo } from '../../../lib/todos'
import {
  WEEKDAY,
  eventColor,
  sourceKey,
  sourceLabel,
} from './workstationShared'

export interface PlannerWeekViewProps {
  selectedDate: string
  events: EventItem[]
  todos: Todo[]
  sources: IntegrationSource[]
  decorations: Record<string, DateDecoration>
  onSelectDate: (date: string) => void
  onOpenCapture: (type: 'event' | 'todo', date?: string) => void
  onToggleTodo: (todo: Todo) => void
  pendingTodoIds?: Set<string>
  readOnlySourceKeys?: Set<string>
}

export function PlannerWeekView({
  selectedDate,
  events,
  todos,
  sources,
  decorations,
  onSelectDate,
  onOpenCapture,
  onToggleTodo,
  pendingTodoIds = new Set<string>(),
  readOnlySourceKeys = new Set<string>(),
}: PlannerWeekViewProps) {
  const week = weekDates(selectedDate)

  return (
    <section className="planner-week-view" aria-label="주간 통합 보기">
      {week.map((date, index) => {
        const dayEvents = events.filter((event) =>
          eventOccursOnDate(event, date),
        )
        const dayTodos = todos.filter(
          (todo) => !todo.done && todo.due_date === date,
        )
        const selected = selectedDate === date

        return (
          <article
            key={date}
            data-decoration={decorations[date]}
            className={`planner-week-day ${
              selected ? 'planner-week-day--selected' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectDate(date)}
              className="planner-week-day__header"
            >
              <span>{WEEKDAY[index]}</span>
              <strong>{Number(date.slice(8, 10))}</strong>
            </button>
            <div className="planner-week-day__items">
              {dayEvents.map((event) => (
                <div
                  key={event.id}
                  className="planner-week-item"
                  style={{
                    '--item-color': eventColor(event, sources),
                  } as CSSProperties}
                >
                  <span className="planner-week-item__time">
                    {kstTimeHHMM(event.starts_at)}
                  </span>
                  <strong>{event.title}</strong>
                  <span>{sourceLabel(event, sources)}</span>
                </div>
              ))}
              {dayTodos.map((todo) => (
                <label
                  key={todo.id}
                  className="planner-week-item planner-week-item--todo"
                  style={{
                    '--item-color': PRIORITY_COLOR[todo.priority],
                  } as CSSProperties}
                >
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => onToggleTodo(todo)}
                    disabled={
                      pendingTodoIds.has(todo.id)
                      || readOnlySourceKeys.has(sourceKey(todo))
                    }
                  />
                  <strong>{todo.title}</strong>
                  <span>{todo.due_time ?? '할 일'}</span>
                </label>
              ))}
              {dayEvents.length === 0 && dayTodos.length === 0 && (
                <p className="planner-day-empty">비어 있음</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenCapture('event', date)}
              className="planner-week-day__add"
            >
              <Plus aria-hidden size={14} /> 추가
            </button>
          </article>
        )
      })}
    </section>
  )
}
