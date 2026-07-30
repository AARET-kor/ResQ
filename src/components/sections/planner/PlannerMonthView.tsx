import { CalendarRange, CheckCircle2, Plus } from 'lucide-react'
import type { CSSProperties } from 'react'
import { monthGrid } from '../../../lib/calendar'
import type { EventItem } from '../../../lib/events'
import type { IntegrationSource } from '../../../lib/integrations'
import {
  eventDisplayRange,
  eventIsMultiDay,
  eventOccursOnDate,
  todayKst,
  type DateDecoration,
} from '../../../lib/planner'
import { PRIORITY_COLOR, type Todo } from '../../../lib/todos'
import {
  WEEKDAY,
  eventColor,
  sourceLabel,
} from './workstationShared'

export interface PlannerMonthViewProps {
  year: number
  month0: number
  events: EventItem[]
  todos: Todo[]
  sources: IntegrationSource[]
  selectedDate: string
  decorations: Record<string, DateDecoration>
  onSelectDate: (date: string) => void
  onOpenCapture: (type: 'event' | 'todo', date?: string) => void
}

export function PlannerMonthView({
  year,
  month0,
  events,
  todos,
  sources,
  selectedDate,
  decorations,
  onSelectDate,
  onOpenCapture,
}: PlannerMonthViewProps) {
  const monthCells = monthGrid(year, month0)

  return (
    <section
      className="planner-month-view"
      aria-label={`${year}년 ${month0 + 1}월 통합 달력`}
    >
      <div className="planner-month-weekdays" aria-hidden="true">
        {WEEKDAY.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="planner-month-grid" role="grid">
        {monthCells.map((cell) => {
          const dayEvents = events.filter((event) =>
            eventOccursOnDate(event, cell.date),
          )
          const dayTodos = todos.filter(
            (todo) => !todo.done && todo.due_date === cell.date,
          )
          const isSelected = selectedDate === cell.date
          const isToday = todayKst() === cell.date
          const decoration = decorations[cell.date]

          return (
            <div
              key={cell.date}
              role="gridcell"
              data-decoration={decoration}
              className={`planner-month-cell ${
                cell.inMonth ? '' : 'planner-month-cell--outside'
              } ${isSelected ? 'planner-month-cell--selected' : ''}`}
            >
              <div className="planner-month-cell__header">
                <button
                  type="button"
                  aria-label={`${cell.date} 선택`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectDate(cell.date)}
                  className={`planner-date-number ${
                    isToday ? 'planner-date-number--today' : ''
                  }`}
                >
                  {Number(cell.date.slice(8, 10))}
                </button>
                {isSelected && (
                  <button
                    type="button"
                    aria-label={`${cell.date}에 항목 추가`}
                    onClick={() => onOpenCapture('event', cell.date)}
                    className="planner-cell-add"
                  >
                    <Plus aria-hidden size={13} />
                  </button>
                )}
              </div>
              <div className="planner-month-cell__items">
                {dayEvents.slice(0, 2).map((event) => {
                  const range = eventDisplayRange(event)
                  const isStart = range.startDate === cell.date
                  const isEnd = range.endDate === cell.date

                  return (
                    <span
                      key={event.id}
                      title={`${event.title} · ${sourceLabel(event, sources)}`}
                      className={`planner-event-bar ${
                        eventIsMultiDay(event) ? 'planner-event-bar--span' : ''
                      } ${isStart ? 'planner-event-bar--start' : ''} ${
                        isEnd ? 'planner-event-bar--end' : ''
                      }`}
                      style={{
                        '--item-color': eventColor(event, sources),
                      } as CSSProperties}
                    >
                      {eventIsMultiDay(event) && (
                        <CalendarRange aria-hidden size={11} />
                      )}
                      <span>{event.title}</span>
                    </span>
                  )
                })}
                {dayTodos.slice(0, 1).map((todo) => (
                  <span
                    key={todo.id}
                    title={`${todo.title} · ${sourceLabel(todo, sources)}`}
                    className="planner-todo-chip"
                    style={{
                      '--item-color': PRIORITY_COLOR[todo.priority],
                    } as CSSProperties}
                  >
                    <CheckCircle2 aria-hidden size={11} />
                    <span>{todo.title}</span>
                  </span>
                ))}
                {dayEvents.length + dayTodos.length > 3 && (
                  <span className="planner-more-count">
                    +{dayEvents.length + dayTodos.length - 3}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
