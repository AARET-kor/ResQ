import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  ListTodo,
  LockKeyhole,
  MapPin,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { EventItem } from '../../../lib/events'
import type { IntegrationSource } from '../../../lib/integrations'
import {
  eventDisplayRange,
  eventOccursOnDate,
  kstTimeHHMM,
} from '../../../lib/planner'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  sortTodos,
  type Todo,
} from '../../../lib/todos'
import {
  eventColor,
  isPlannerItemReadOnly,
  shortDate,
  sourceLabel,
  type PlannerItemSelection,
} from './workstationShared'

export interface PlannerInspectorProps {
  selectedDate?: string | null
  selection?: PlannerItemSelection | null
  events: EventItem[]
  todos: Todo[]
  sources: IntegrationSource[]
  readOnlySourceKeys?: ReadonlySet<string>
  pendingTodoIds?: ReadonlySet<string>
  deletingEventIds?: ReadonlySet<string>
  onSelectItem?: (selection: PlannerItemSelection) => void
  onBackToDay?: () => void
  onClose: () => void
  onToggleTodo?: (todo: Todo) => void
  onDeleteTodo?: (id: string) => void
  onDeleteEvent?: (id: string) => void
}

function syncLabel(status: EventItem['sync_status'] | Todo['sync_status']) {
  if (status === 'pending') return '동기화 대기'
  if (status === 'error') return '동기화 확인 필요'
  return '동기화됨'
}

export function PlannerInspector({
  selectedDate,
  selection,
  events,
  todos,
  sources,
  readOnlySourceKeys = new Set<string>(),
  pendingTodoIds = new Set<string>(),
  deletingEventIds = new Set<string>(),
  onSelectItem,
  onBackToDay,
  onClose,
  onToggleTodo,
  onDeleteTodo,
  onDeleteEvent,
}: PlannerInspectorProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const selectionId = selection?.type === 'event'
    ? selection.event.id
    : selection?.type === 'todo'
      ? selection.todo.id
      : null

  useEffect(() => {
    setConfirmingDelete(false)
  }, [selection?.type, selectionId])

  const dayItems = useMemo(() => {
    if (!selectedDate) return []
    const eventItems: PlannerItemSelection[] = events
      .filter((event) => eventOccursOnDate(event, selectedDate))
      .map((event) => ({ type: 'event', event }))
    const todoItems: PlannerItemSelection[] = sortTodos(
      todos.filter((todo) => todo.due_date === selectedDate),
    ).map((todo) => ({ type: 'todo', todo }))
    return [...eventItems, ...todoItems]
  }, [events, selectedDate, todos])

  if (!selectedDate && !selection) return null

  const selectedItem = selection?.type === 'event'
    ? selection.event
    : selection?.type === 'todo'
      ? selection.todo
      : null
  const readOnly = selectedItem
    ? isPlannerItemReadOnly(selectedItem, readOnlySourceKeys)
    : false
  const pending = selection?.type === 'event'
    ? deletingEventIds.has(selection.event.id)
    : selection?.type === 'todo'
      ? pendingTodoIds.has(selection.todo.id)
      : false
  const canDelete = selection?.type === 'event'
    ? Boolean(onDeleteEvent)
    : selection?.type === 'todo'
      ? Boolean(onDeleteTodo)
      : false

  const deleteSelected = () => {
    if (!selection || readOnly || pending) return
    if (selection.type === 'event') onDeleteEvent?.(selection.event.id)
    else onDeleteTodo?.(selection.todo.id)
    setConfirmingDelete(false)
  }

  return (
    <aside
      className="planner-inspector"
      aria-label={selection ? '선택 항목 상세' : '선택 날짜 상세'}
    >
      <header className="planner-inspector__header">
        <div>
          <p className="planner-kicker">
            {selection ? 'Item details' : 'Day overview'}
          </p>
          <h3>
            {selection
              ? selection.type === 'event'
                ? '일정 상세'
                : '할 일 상세'
              : selectedDate
                ? shortDate(selectedDate)
                : '상세'}
          </h3>
        </div>
        <div className="planner-inspector__header-actions">
          {selection && selectedDate && onBackToDay && (
            <button
              type="button"
              aria-label="날짜 목록으로 돌아가기"
              onClick={onBackToDay}
              className="resq-icon-control planner-inspector__back"
              data-inspector-back
            >
              <ArrowLeft aria-hidden size={16} />
            </button>
          )}
          <button
            type="button"
            aria-label="상세 닫기"
            onClick={onClose}
            className="resq-icon-control"
          >
            <X aria-hidden size={17} />
          </button>
        </div>
      </header>

      {!selection && (
        <div className="planner-inspector__day-list">
          {dayItems.map((item) => {
            const value = item.type === 'event' ? item.event : item.todo
            const color = item.type === 'event'
              ? eventColor(item.event, sources)
              : PRIORITY_COLOR[item.todo.priority]

            return (
              <button
                key={`${item.type}:${value.id}`}
                type="button"
                onClick={() => onSelectItem?.(item)}
                className="planner-inspector__day-item"
                style={{ '--item-color': color } as CSSProperties}
              >
                <span className="planner-inspector__day-icon">
                  {item.type === 'event'
                    ? <CalendarClock aria-hidden size={16} />
                    : <ListTodo aria-hidden size={16} />}
                </span>
                <span>
                  <strong>{value.title}</strong>
                  <small>
                    {item.type === 'event'
                      ? kstTimeHHMM(item.event.starts_at)
                      : item.todo.due_time ?? '시간 없음'}
                    {' · '}
                    {sourceLabel(value, sources)}
                  </small>
                </span>
              </button>
            )
          })}
          {dayItems.length === 0 && (
            <div className="planner-inspector__empty">
              <CalendarClock aria-hidden size={22} />
              <strong>이 날짜는 비어 있습니다</strong>
              <span>달력의 추가 버튼으로 일정이나 할 일을 기록하세요.</span>
            </div>
          )}
        </div>
      )}

      {selection?.type === 'event' && (
        <div className="planner-inspector__detail">
          <span
            className="planner-inspector__type-icon"
            style={{
              '--item-color': eventColor(selection.event, sources),
            } as CSSProperties}
          >
            <CalendarClock aria-hidden size={21} />
          </span>
          <div className="planner-inspector__title">
            <h4>{selection.event.title}</h4>
            <span>{sourceLabel(selection.event, sources)}</span>
          </div>
          <dl className="planner-inspector__meta">
            <div>
              <dt>시작</dt>
              <dd>
                {shortDate(eventDisplayRange(selection.event).startDate)}
                {' '}
                {kstTimeHHMM(selection.event.starts_at)}
              </dd>
            </div>
            {selection.event.ends_at && (
              <div>
                <dt>종료</dt>
                <dd>
                  {shortDate(eventDisplayRange(selection.event).endDate)}
                  {' '}
                  {kstTimeHHMM(selection.event.ends_at)}
                </dd>
              </div>
            )}
            <div>
              <dt>상태</dt>
              <dd>{syncLabel(selection.event.sync_status)}</dd>
            </div>
          </dl>
          {selection.event.location && (
            <p className="planner-inspector__location">
              <MapPin aria-hidden size={15} />
              {selection.event.location}
            </p>
          )}
          {selection.event.notes && (
            <div className="planner-inspector__notes">
              <strong>메모</strong>
              <p>{selection.event.notes}</p>
            </div>
          )}
        </div>
      )}

      {selection?.type === 'todo' && (
        <div className="planner-inspector__detail">
          <span
            className="planner-inspector__type-icon"
            style={{
              '--item-color': PRIORITY_COLOR[selection.todo.priority],
            } as CSSProperties}
          >
            <ListTodo aria-hidden size={21} />
          </span>
          <div className="planner-inspector__title">
            <h4>{selection.todo.title}</h4>
            <span>{sourceLabel(selection.todo, sources)}</span>
          </div>
          <dl className="planner-inspector__meta">
            <div>
              <dt>마감</dt>
              <dd>
                {selection.todo.due_date
                  ? shortDate(selection.todo.due_date)
                  : '날짜 없음'}
                {selection.todo.due_time
                  ? ` ${selection.todo.due_time}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>우선순위</dt>
              <dd>{PRIORITY_LABEL[selection.todo.priority]}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>
                {selection.todo.done ? '완료' : syncLabel(selection.todo.sync_status)}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {selection && (
        <footer className="planner-inspector__footer">
          {readOnly && (
            <p className="planner-inspector__read-only">
              <LockKeyhole aria-hidden size={14} />
              읽기 전용 연결입니다. 변경은 원본 앱에서 해주세요.
            </p>
          )}
          <div className="planner-inspector__actions">
            {selection.type === 'todo' && onToggleTodo && (
              <button
                type="button"
                disabled={pending || readOnly}
                onClick={() => onToggleTodo(selection.todo)}
                className="resq-secondary-button"
              >
                <CheckCircle2 aria-hidden size={15} />
                {selection.todo.done ? '완료 취소' : '완료'}
              </button>
            )}
            {selectedItem?.external_url && (
              <a
                href={selectedItem.external_url}
                target="_blank"
                rel="noreferrer"
                className="resq-secondary-button"
              >
                <ExternalLink aria-hidden size={15} />
                원본 앱
              </a>
            )}
            {canDelete && !confirmingDelete && (
              <button
                type="button"
                disabled={pending || readOnly}
                onClick={() => setConfirmingDelete(true)}
                className="resq-secondary-button planner-delete-button"
              >
                <Trash2 aria-hidden size={15} />
                {pending ? '삭제 중…' : '삭제'}
              </button>
            )}
          </div>
          {confirmingDelete && (
            <div
              className="planner-inspector__confirm"
              role="group"
              aria-label="삭제 확인"
            >
              <span>이 항목을 삭제할까요?</span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="resq-secondary-button"
              >
                취소
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                className="resq-primary-button planner-delete-confirm"
              >
                삭제 확인
              </button>
            </div>
          )}
        </footer>
      )}
    </aside>
  )
}
