import {
  CalendarClock,
  CopyCheck,
  ExternalLink,
  ListTodo,
} from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'
import type { EventItem } from '../../../lib/events'
import {
  PROVIDER_LABEL,
  type IntegrationSource,
} from '../../../lib/integrations'
import {
  buildPlannerAgenda,
  sourceForItem,
} from '../../../lib/planner'
import { PRIORITY_COLOR, type Todo } from '../../../lib/todos'
import { buildUnifiedTimeline } from '../../../lib/unifiedTimeline'
import {
  eventColor,
  shortDate,
} from './workstationShared'

export interface PlannerAgendaViewProps {
  visibleEvents: EventItem[]
  visibleTodos: Todo[]
  sources: IntegrationSource[]
  readOnlySourceKeys: Set<string>
  pendingTodoIds: Set<string>
  onToggleTodo: (todo: Todo) => void
}

export function PlannerAgendaView({
  visibleEvents,
  visibleTodos,
  sources,
  readOnlySourceKeys,
  pendingTodoIds,
  onToggleTodo,
}: PlannerAgendaViewProps) {
  const { agenda, duplicateByKey } = useMemo(() => {
    const unifiedTimeline = buildUnifiedTimeline(
      visibleEvents,
      visibleTodos,
      sources,
    )
    const agendaKeys = new Set(unifiedTimeline.map((item) => item.key))

    return {
      agenda: buildPlannerAgenda(visibleEvents, visibleTodos)
        .filter((item) => agendaKeys.has(item.key)),
      duplicateByKey: new Map(
        unifiedTimeline.map((item) => [item.key, item] as const),
      ),
    }
  }, [sources, visibleEvents, visibleTodos])

  return (
    <section className="planner-agenda" aria-label="통합 아젠다">
      {agenda.slice(0, 48).map((item) => {
        const source = item.event
          ? sourceForItem(item.event, sources)
          : item.todo
            ? sourceForItem(item.todo, sources)
            : undefined
        const duplicate = duplicateByKey.get(item.key)
        const externalUrl = item.event?.external_url ?? item.todo?.external_url
        const readOnly = item.provider !== 'resq'
          && readOnlySourceKeys.has(`${item.provider}:${item.sourceId}`)

        return (
          <article
            key={item.key}
            className={`planner-agenda-row ${
              item.done ? 'planner-agenda-row--done' : ''
            }`}
          >
            <time className="planner-agenda-row__date">
              <strong>{item.date ? shortDate(item.date) : '날짜 없음'}</strong>
              <span>
                {item.time ?? (item.type === 'todo' ? '할 일' : '종일')}
              </span>
            </time>
            <span
              className="planner-agenda-row__mark"
              style={{
                '--item-color': item.event
                  ? eventColor(item.event, sources)
                  : PRIORITY_COLOR[item.priority ?? 'normal'],
              } as CSSProperties}
            >
              {item.type === 'event'
                ? <CalendarClock aria-hidden size={16} />
                : <ListTodo aria-hidden size={16} />}
            </span>
            <div className="planner-agenda-row__main">
              <strong>{item.title}</strong>
              <span>
                {source?.name
                  ?? (item.provider === 'resq'
                    ? 'ResQ'
                    : PROVIDER_LABEL[item.provider])}
                {duplicate && duplicate.duplicateCount > 1 && (
                  <em
                    className="planner-duplicate-note"
                    title={`같은 항목을 ${duplicate.duplicateProviders.length}개 출처에서 감지했습니다.`}
                  >
                    <CopyCheck aria-hidden size={12} />
                    중복 {duplicate.duplicateCount}개 통합
                  </em>
                )}
              </span>
            </div>
            {item.todo && (
              <button
                type="button"
                disabled={pendingTodoIds.has(item.todo.id) || readOnly}
                onClick={() => onToggleTodo(item.todo!)}
                className="resq-secondary-button"
              >
                {item.todo.done ? '되돌리기' : '완료'}
              </button>
            )}
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`${item.title} 원본 앱에서 열기`}
                className="resq-icon-control"
              >
                <ExternalLink aria-hidden size={15} />
              </a>
            )}
          </article>
        )
      })}

      {agenda.length === 0 && (
        <div className="planner-view-empty">
          <CalendarClock aria-hidden size={24} />
          <strong>조건에 맞는 일정이 없습니다</strong>
          <span>검색어나 출처 필터를 바꾸거나 새 항목을 추가해 보세요.</span>
        </div>
      )}
    </section>
  )
}
