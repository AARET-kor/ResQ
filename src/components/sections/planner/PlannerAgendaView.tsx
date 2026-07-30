import {
  CalendarClock,
  CopyCheck,
  ExternalLink,
  ListTodo,
  LockKeyhole,
  Trash2,
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
  isPlannerItemReadOnly,
  shortDate,
  type PlannerItemSelection,
} from './workstationShared'

export interface PlannerAgendaViewProps {
  visibleEvents: EventItem[]
  visibleTodos: Todo[]
  sources: IntegrationSource[]
  readOnlySourceKeys: Set<string>
  pendingTodoIds: Set<string>
  onToggleTodo: (todo: Todo) => void
  onSelectItem?: (selection: PlannerItemSelection) => void
  onDeleteTodo?: (id: string) => void
  onDeleteEvent?: (id: string) => void
  deletingEventIds?: Set<string>
}

export function PlannerAgendaView({
  visibleEvents,
  visibleTodos,
  sources,
  readOnlySourceKeys,
  pendingTodoIds,
  onToggleTodo,
  onSelectItem,
  onDeleteTodo,
  onDeleteEvent,
  deletingEventIds = new Set<string>(),
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
        const selectedItem = item.event
          ? { type: 'event' as const, event: item.event }
          : item.todo
            ? { type: 'todo' as const, todo: item.todo }
            : null
        const readOnly = selectedItem
          ? isPlannerItemReadOnly(
            selectedItem.type === 'event'
              ? selectedItem.event
              : selectedItem.todo,
            readOnlySourceKeys,
          )
          : false
        const pending = item.todo
          ? pendingTodoIds.has(item.todo.id)
          : item.event
            ? deletingEventIds.has(item.event.id)
            : false

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
            <button
              type="button"
              disabled={!selectedItem || !onSelectItem}
              onClick={() => {
                if (selectedItem) onSelectItem?.(selectedItem)
              }}
              className="planner-agenda-row__main"
              aria-label={`${item.title} 상세 보기`}
            >
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
            </button>
            <div className="planner-agenda-row__actions">
              {readOnly && (
                <span
                  className="planner-read-only-mark"
                  title="읽기 전용 연결입니다. 원본 앱에서 수정하세요."
                >
                  <LockKeyhole aria-hidden size={13} />
                  읽기 전용
                </span>
              )}
              {item.todo && (
                <button
                  type="button"
                  disabled={pending || readOnly}
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
              {item.todo && onDeleteTodo && (
                <button
                  type="button"
                  aria-label={`${item.title} 할 일 삭제`}
                  title={readOnly
                    ? '읽기 전용 연결에서는 원본 앱에서 삭제하세요.'
                    : '할 일 삭제'}
                  disabled={pending || readOnly}
                  onClick={() => onDeleteTodo(item.todo!.id)}
                  className="resq-icon-control planner-delete-control"
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              )}
              {item.event && onDeleteEvent && (
                <button
                  type="button"
                  aria-label={`${item.title} 일정 삭제`}
                  title={readOnly
                    ? '읽기 전용 연결에서는 원본 앱에서 삭제하세요.'
                    : '일정 삭제'}
                  disabled={pending || readOnly}
                  onClick={() => onDeleteEvent(item.event!.id)}
                  className="resq-icon-control planner-delete-control"
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              )}
            </div>
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
