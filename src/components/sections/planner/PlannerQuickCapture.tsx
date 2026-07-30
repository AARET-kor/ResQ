import { CalendarDays, ListTodo, Plus, X } from 'lucide-react'
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { EVENT_KINDS, type EventKind } from '../../../lib/events'
import {
  PROVIDER_LABEL,
  type IntegrationSource,
} from '../../../lib/integrations'
import { addDaysISO } from '../../../lib/planner'
import {
  PRIORITIES,
  PRIORITY_LABEL,
  type TodoPriority,
} from '../../../lib/todos'
import {
  PROVIDER_FALLBACK,
  type EventDraft,
  type TodoDraftOptions,
} from './workstationShared'

export type PlannerCaptureType = 'event' | 'todo'

export interface PlannerQuickCaptureProps {
  initialType: PlannerCaptureType
  initialDate: string
  selectedSources: IntegrationSource[]
  addingEvent?: boolean
  addingTodo?: boolean
  onAddEvent: (event: EventDraft) => boolean | void | Promise<boolean | void>
  onAddTodo: (
    title: string,
    options: TodoDraftOptions,
  ) => boolean | void | Promise<boolean | void>
  onClose: () => void
}

export function PlannerQuickCapture({
  initialType,
  initialDate,
  selectedSources,
  addingEvent = false,
  addingTodo = false,
  onAddEvent,
  onAddTodo,
  onClose,
}: PlannerQuickCaptureProps) {
  const [captureType, setCaptureType] =
    useState<PlannerCaptureType>(initialType)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState('09:00')
  const [endDate, setEndDate] = useState('')
  const [kind, setKind] = useState<EventKind>('other')
  const [priority, setPriority] = useState<TodoPriority>('normal')
  const [targetId, setTargetId] = useState('resq')

  const writableTargets = useMemo(
    () =>
      selectedSources.filter(
        (source) =>
          source.selected
          && source.can_write
          && source.sync_mode === 'two_way'
          && source.resource_type
            === (captureType === 'event' ? 'calendar' : 'task_list'),
      ),
    [captureType, selectedSources],
  )
  const selectedTarget = writableTargets.find(
    (source) => source.id === targetId,
  )
  const targetColor = selectedTarget
    ? selectedTarget.color ?? PROVIDER_FALLBACK[selectedTarget.provider]
    : PROVIDER_FALLBACK.resq
  const isSaving = captureType === 'event' ? addingEvent : addingTodo

  const selectType = (nextType: PlannerCaptureType) => {
    setCaptureType(nextType)
    setTargetId('resq')
    if (nextType === 'todo') setEndDate('')
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedTitle = title.trim()
    if (!normalizedTitle || !date || isSaving) return

    let saved: boolean | void
    if (captureType === 'event') {
      if (!time) return
      saved = await onAddEvent({
        title: normalizedTitle,
        starts_at: `${date}T${time}:00+09:00`,
        ends_at: endDate ? `${endDate}T${time}:00+09:00` : null,
        kind,
        source_provider: selectedTarget?.provider ?? null,
        external_source_id: selectedTarget?.external_id ?? null,
        sync_status: selectedTarget ? 'pending' : 'synced',
      })
    } else {
      saved = await onAddTodo(normalizedTitle, {
        priority,
        dueDate: date || null,
        dueTime: time || null,
        sourceProvider: selectedTarget?.provider ?? null,
        externalSourceId: selectedTarget?.external_id ?? null,
        syncStatus: selectedTarget ? 'pending' : 'synced',
      })
    }

    if (saved === false) return
    onClose()
  }

  return (
    <form onSubmit={save} className="planner-capture" aria-label="통합 추가">
      <div className="planner-capture__header">
        <div>
          <p className="planner-kicker">Quick capture</p>
          <h3>한 번 입력하고 원하는 위치에 저장</h3>
        </div>
        <button
          type="button"
          aria-label="통합 추가 닫기"
          onClick={onClose}
          className="resq-icon-control"
        >
          <X aria-hidden size={17} />
        </button>
      </div>

      <div className="planner-capture__type" aria-label="추가할 항목 종류">
        <button
          type="button"
          aria-pressed={captureType === 'event'}
          onClick={() => selectType('event')}
          className={captureType === 'event' ? 'is-active' : ''}
        >
          <CalendarDays aria-hidden size={15} />
          일정
        </button>
        <button
          type="button"
          aria-pressed={captureType === 'todo'}
          onClick={() => selectType('todo')}
          className={captureType === 'todo' ? 'is-active' : ''}
        >
          <ListTodo aria-hidden size={15} />
          할 일
        </button>
      </div>

      <label className="resq-field-label planner-capture__title">
        제목
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={
            captureType === 'event' ? '예: 컨퍼런스 발표' : '예: 초록 제출'
          }
          className="resq-field"
        />
      </label>

      <label className="resq-field-label">
        {captureType === 'event' ? '시작일' : '마감일'}
        <input
          type="date"
          value={date}
          onChange={(event) => {
            const nextDate = event.target.value
            setDate(nextDate)
            if (endDate && endDate <= nextDate) setEndDate('')
          }}
          className="resq-field"
        />
      </label>

      <label className="resq-field-label">
        시간
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="resq-field"
        />
      </label>

      {captureType === 'event' ? (
        <>
          <label className="resq-field-label">
            종료일 · 여러 날 일정
            <input
              type="date"
              min={date ? addDaysISO(date, 1) : undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="resq-field"
            />
          </label>
          <label className="resq-field-label">
            종류
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as EventKind)}
              className="resq-select"
            >
              {Object.entries(EVENT_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label className="resq-field-label">
          우선순위
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as TodoPriority)}
            className="resq-select"
          >
            {PRIORITIES.map((todoPriority) => (
              <option key={todoPriority} value={todoPriority}>
                {PRIORITY_LABEL[todoPriority]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="resq-field-label">
        저장 위치
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          className="resq-select"
          style={{ borderColor: targetColor } as CSSProperties}
        >
          <option value="resq">ResQ에만 저장</option>
          {writableTargets.map((source) => (
            <option key={source.id} value={source.id}>
              {PROVIDER_LABEL[source.provider]} · {source.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={!title.trim() || !date || !time || isSaving}
        className="resq-primary-button planner-capture__submit"
      >
        <Plus aria-hidden size={16} />
        {captureType === 'event'
          ? addingEvent
            ? '일정 저장 중…'
            : '일정 저장'
          : addingTodo
            ? '할 일 저장 중…'
            : '할 일 저장'}
      </button>
    </form>
  )
}
