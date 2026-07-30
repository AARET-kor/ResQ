import {
  CalendarClock,
  CheckCircle2,
  ListTodo,
  Save,
  Trash2,
} from 'lucide-react'
import type { ChangeEvent } from 'react'
import { EVENT_KINDS, type EventKind } from '../../../lib/events'
import {
  kstDateISO,
  kstTimeHHMM,
  todayKst,
} from '../../../lib/planner'
import type {
  PlannerCandidate,
  PlannerEventCandidate,
  PlannerTodoCandidate,
} from '../../../lib/plannerExtract'
import {
  PRIORITIES,
  PRIORITY_LABEL,
  type TodoPriority,
} from '../../../lib/todos'

export interface PlannerCandidateCardProps {
  candidate: PlannerCandidate
  selected: boolean
  saving?: boolean
  error?: string | null
  onSelect: (selected: boolean) => void
  onChange: (candidate: PlannerCandidate) => void
  onSave: (candidate: PlannerCandidate) => void
  onDismiss: (id: string) => void
}

function dateTimeLocal(value: string | null): string {
  return value ? value.slice(0, 16) : ''
}

function withZone(
  localValue: string,
  previousValue?: string | null,
): string {
  const zone = previousValue?.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1]
    ?? '+09:00'
  return `${localValue}:00${zone}`
}

function asEvent(candidate: PlannerCandidate): PlannerEventCandidate {
  if (candidate.type === 'event') return candidate
  const date = candidate.due_date ?? todayKst()
  const time = candidate.due_time ?? '09:00'
  return {
    id: candidate.id,
    type: 'event',
    title: candidate.title,
    starts_at: `${date}T${time}:00+09:00`,
    ends_at: null,
    location: null,
    notes: null,
    kind: 'other',
  }
}

function asTodo(candidate: PlannerCandidate): PlannerTodoCandidate {
  if (candidate.type === 'todo') return candidate
  return {
    id: candidate.id,
    type: 'todo',
    title: candidate.title,
    due_date: kstDateISO(candidate.starts_at),
    due_time: kstTimeHHMM(candidate.starts_at),
    priority: 'normal',
  }
}

export function PlannerCandidateCard({
  candidate,
  selected,
  saving = false,
  error,
  onSelect,
  onChange,
  onSave,
  onDismiss,
}: PlannerCandidateCardProps) {
  const changeType = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value === 'event'
      ? asEvent(candidate)
      : asTodo(candidate))
  }

  return (
    <article
      className={`planner-candidate ${
        error ? 'planner-candidate--error' : ''
      }`}
      aria-label={`${candidate.title} AI 후보`}
    >
      <header className="planner-candidate__header">
        <label className="planner-candidate__select">
          <input
            type="checkbox"
            checked={selected}
            disabled={saving}
            onChange={(event) => onSelect(event.target.checked)}
          />
          <span>저장 선택</span>
        </label>
        <label className="planner-candidate__type">
          <span className="sr-only">항목 종류</span>
          <select
            aria-label={`${candidate.title} 항목 종류`}
            value={candidate.type}
            disabled={saving}
            onChange={changeType}
          >
            <option value="todo">할 일</option>
            <option value="event">일정</option>
          </select>
        </label>
      </header>

      <label className="resq-field-label planner-candidate__title">
        제목
        <input
          aria-label={`${candidate.title} 제목`}
          value={candidate.title}
          maxLength={300}
          disabled={saving}
          onChange={(event) =>
            onChange({ ...candidate, title: event.target.value })}
          className="resq-field"
        />
      </label>

      {candidate.type === 'todo' ? (
        <div className="planner-candidate__fields">
          <label className="resq-field-label">
            마감일
            <input
              type="date"
              aria-label={`${candidate.title} 마감일`}
              value={candidate.due_date ?? ''}
              disabled={saving}
              onChange={(event) =>
                onChange({
                  ...candidate,
                  due_date: event.target.value || null,
                  due_time: event.target.value
                    ? candidate.due_time
                    : null,
                })}
              className="resq-field"
            />
          </label>
          <label className="resq-field-label">
            시간
            <input
              type="time"
              aria-label={`${candidate.title} 마감 시간`}
              value={candidate.due_time ?? ''}
              disabled={saving || !candidate.due_date}
              onChange={(event) =>
                onChange({
                  ...candidate,
                  due_time: event.target.value || null,
                })}
              className="resq-field"
            />
          </label>
          <label className="resq-field-label">
            우선순위
            <select
              aria-label={`${candidate.title} 우선순위`}
              value={candidate.priority}
              disabled={saving}
              onChange={(event) =>
                onChange({
                  ...candidate,
                  priority: event.target.value as TodoPriority,
                })}
              className="resq-select"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABEL[priority]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <div className="planner-candidate__fields planner-candidate__fields--event">
            <label className="resq-field-label">
              시작
              <input
                type="datetime-local"
                aria-label={`${candidate.title} 시작`}
                value={dateTimeLocal(candidate.starts_at)}
                disabled={saving}
                onChange={(event) =>
                  onChange({
                    ...candidate,
                    starts_at: withZone(
                      event.target.value,
                      candidate.starts_at,
                    ),
                  })}
                className="resq-field"
              />
            </label>
            <label className="resq-field-label">
              종료
              <input
                type="datetime-local"
                aria-label={`${candidate.title} 종료`}
                value={dateTimeLocal(candidate.ends_at)}
                min={dateTimeLocal(candidate.starts_at)}
                disabled={saving}
                onChange={(event) =>
                  onChange({
                    ...candidate,
                    ends_at: event.target.value
                      ? withZone(event.target.value, candidate.ends_at)
                      : null,
                  })}
                className="resq-field"
              />
            </label>
            <label className="resq-field-label">
              종류
              <select
                aria-label={`${candidate.title} 일정 종류`}
                value={candidate.kind}
                disabled={saving}
                onChange={(event) =>
                  onChange({
                    ...candidate,
                    kind: event.target.value as EventKind,
                  })}
                className="resq-select"
              >
                {Object.entries(EVENT_KINDS).map(([kind, label]) => (
                  <option key={kind} value={kind}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="planner-candidate__fields planner-candidate__fields--notes">
            <label className="resq-field-label">
              장소
              <input
                aria-label={`${candidate.title} 장소`}
                value={candidate.location ?? ''}
                maxLength={500}
                disabled={saving}
                onChange={(event) =>
                  onChange({
                    ...candidate,
                    location: event.target.value || null,
                  })}
                className="resq-field"
              />
            </label>
            <label className="resq-field-label">
              메모
              <input
                aria-label={`${candidate.title} 메모`}
                value={candidate.notes ?? ''}
                maxLength={5000}
                disabled={saving}
                onChange={(event) =>
                  onChange({
                    ...candidate,
                    notes: event.target.value || null,
                  })}
                className="resq-field"
              />
            </label>
          </div>
        </>
      )}

      {error && (
        <p className="planner-candidate__error" role="alert">
          저장하지 못했습니다. {error}
        </p>
      )}

      <footer className="planner-candidate__actions">
        <span className="planner-candidate__kind">
          {candidate.type === 'event'
            ? <CalendarClock aria-hidden size={14} />
            : <ListTodo aria-hidden size={14} />}
          {candidate.type === 'event' ? '일정 후보' : '할 일 후보'}
        </span>
        <button
          type="button"
          aria-label={`${candidate.title} 후보 제거`}
          disabled={saving}
          onClick={() => onDismiss(candidate.id)}
          className="resq-text-action"
        >
          <Trash2 aria-hidden size={14} />
          제거
        </button>
        <button
          type="button"
          disabled={saving || !candidate.title.trim()}
          onClick={() => onSave(candidate)}
          className="resq-primary-button"
        >
          {saving
            ? <CheckCircle2 aria-hidden size={15} />
            : <Save aria-hidden size={15} />}
          {saving ? '저장 중…' : '저장'}
        </button>
      </footer>
    </article>
  )
}
