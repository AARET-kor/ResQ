import { useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { ClipboardPaste, Inbox, ListTodo, Mic, Plus } from 'lucide-react'
import { LiquidGlass } from '../LiquidGlass'
import { sortTodos, PRIORITY_LABEL, PRIORITY_COLOR, type Todo, type TodoPriority } from '../../lib/todos'
import type { ExtractedTodo } from '../../lib/todoExtract'
import { PROVIDER_LABEL } from '../../lib/integrations'

const PRIORITIES: TodoPriority[] = ['high', 'normal', 'low']

/** M/D HH:mm (or just M/D when no due time). */
function formatDue(dueDate: string, dueTime: string | null): string {
  const [, m, d] = dueDate.split('-')
  const md = `${Number(m)}/${Number(d)}`
  return dueTime ? `${md} ${dueTime}` : md
}

function readImageAsBase64(file: File): Promise<{ imageBase64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.slice(result.indexOf(',') + 1)
      resolve({ imageBase64: base64, mediaType: file.type || 'image/png' })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function TodoSection({
  todos,
  onAdd,
  onToggle,
  onDelete,
  onExtract,
  extracting = false,
  extracted = [],
  onAddExtracted,
  onDismissExtracted,
  loading = false,
  adding = false,
  addingExtracted = false,
  pendingIds = new Set<string>(),
  readOnlySourceKeys = new Set<string>(),
}: {
  todos: Todo[]
  onAdd: (title: string, opts: { priority: TodoPriority; dueDate: string | null; dueTime: string | null }) => boolean | void | Promise<boolean | void>
  onToggle: (todo: Todo) => void
  onDelete: (id: string) => void
  onExtract?: (input: { text?: string; imageBase64?: string; mediaType?: string }) => void
  extracting?: boolean
  extracted?: ExtractedTodo[]
  onAddExtracted?: (t: ExtractedTodo) => boolean | void | Promise<boolean | void>
  onDismissExtracted?: () => void
  loading?: boolean
  adding?: boolean
  addingExtracted?: boolean
  pendingIds?: Set<string>
  readOnlySourceKeys?: Set<string>
}) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

  // Recomputed every render (not hoisted to module scope) so the capability
  // check reflects window state at render time — tests stub the vendor
  // global right before rendering.
  const SpeechRecognitionCtor =
    typeof window !== 'undefined' ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t || adding) return
    const saved = await onAdd(t, { priority, dueDate: dueDate || null, dueTime: dueTime || null })
    if (saved === false) return
    setTitle('')
    setPriority('normal')
    setDueDate('')
    setDueTime('')
  }

  const handleMicClick = () => {
    if (!SpeechRecognitionCtor) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const rec = new SpeechRecognitionCtor()
    rec.lang = 'ko-KR'
    rec.onresult = (e: any) => {
      const transcript = e?.results?.[0]?.[0]?.transcript ?? ''
      if (transcript) setTitle((t) => (t ? `${t} ${transcript}` : transcript))
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (!onExtract) return
    const items = e.clipboardData?.items
    const imageItem = items ? Array.from(items).find((i) => i.type.startsWith('image/')) : undefined
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) {
        readImageAsBase64(file).then(onExtract)
      }
      return
    }
    const text = e.clipboardData?.getData('text')
    if (text) onExtract({ text })
  }

  const sorted = sortTodos(todos)
  const openCount = sorted.filter((todo) => !todo.done).length

  return (
    <LiquidGlass className="plan-card todo-card">
      <div className="plan-card__content">
        <header className="plan-card__header">
          <div className="plan-card__heading">
            <span className="plan-card__icon">
              <ListTodo aria-hidden size={21} />
            </span>
            <div>
              <h2 className="plan-card__title">할 일</h2>
              <p className="plan-card__subtitle">해야 할 일을 빠르게 기록하고 우선순위를 정하세요.</p>
            </div>
          </div>
          <span className="plan-count">{openCount}개 남음</span>
        </header>

        <form onSubmit={submit} className="todo-composer">
          <div className="todo-title-row">
            <input
              aria-label="할 일 추가"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 회진 준비"
              className="resq-field"
            />
            {SpeechRecognitionCtor && (
              <button
                type="button"
                aria-label="음성 입력"
                onClick={handleMicClick}
                className={`resq-icon-control ${listening ? 'animate-pulse' : ''}`}
              >
                <Mic aria-hidden size={18} />
              </button>
            )}
          </div>

          <div className="todo-options-row">
            <div className="priority-control" aria-label="우선순위 선택">
              {PRIORITIES.map((p) => {
                const selected = priority === p
                return (
                  <button
                    key={p}
                    type="button"
                    aria-label={`우선순위 ${PRIORITY_LABEL[p]}`}
                    aria-pressed={selected}
                    onClick={() => setPriority(p)}
                    style={selected ? { background: PRIORITY_COLOR[p] } : undefined}
                    className={`priority-button ${selected ? 'priority-button--selected' : ''}`}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                )
              })}
            </div>
            <label className="resq-field-label">
              마감일
              <input
                aria-label="마감일"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="resq-field"
              />
            </label>
            <label className="resq-field-label">
              시간
              <input
                aria-label="마감 시간"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="resq-field"
              />
            </label>
            <button type="submit" disabled={adding}
              className="resq-primary-button">
              <Plus aria-hidden size={16} />
              {adding ? '추가 중…' : '추가'}
            </button>
          </div>
        </form>

        <div
          role="group"
          aria-label="할일 붙여넣기 존"
          tabIndex={0}
          onPaste={handlePaste}
          aria-busy={extracting}
          className="paste-zone"
        >
          <span className="paste-zone__icon">
            <ClipboardPaste aria-hidden size={18} />
          </span>
          <span>
            <strong className="paste-zone__title">
              {extracting ? 'AI가 할일을 뽑는 중…' : '메모 또는 사진 붙여넣기'}
            </strong>
            <span className="paste-zone__hint">
              {extracting ? '잠시만 기다려 주세요.' : '복사한 내용을 붙여넣으면 AI가 할 일을 정리합니다.'}
            </span>
          </span>
        </div>

        {extracted.length > 0 && (
          <div className="extracted-todo-panel">
            <div className="extracted-todo-panel__header">
              <span className="extracted-todo-panel__title">AI가 찾은 할 일</span>
              <button
                onClick={onDismissExtracted}
                className="resq-text-action"
              >
                닫기
              </button>
            </div>
            <ul className="extracted-todo-list">
              {extracted.map((t, i) => (
                <li key={i} className="extracted-todo-row">
                  <span className="todo-row__title">{t.title}</span>
                  {t.due_date && (
                    <span className="resq-meta-chip">{formatDue(t.due_date, t.due_time)}</span>
                  )}
                  <span className="resq-meta-chip">{PRIORITY_LABEL[t.priority]}</span>
                  <button
                    onClick={() => onAddExtracted?.(t)}
                    disabled={addingExtracted}
                    className="resq-secondary-button"
                  >
                    할일에 추가
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && (
          <div aria-label="할 일 불러오는 중" className="flex animate-pulse flex-col gap-2">
            {[0, 1, 2].map((item) => <div key={item} className="skeleton-line" />)}
          </div>
        )}
        {!loading && <ul className="todo-list">
          {sorted.map((t) => (
            <li
              key={t.id}
              style={{ borderLeft: `3px solid ${PRIORITY_COLOR[t.priority]}` }}
              className={`todo-row ${t.done ? 'todo-row--done' : ''}`}
            >
              <input
                type="checkbox"
                aria-label={t.title}
                checked={t.done}
                onChange={() => onToggle(t)}
                disabled={pendingIds.has(t.id) || Boolean(
                  t.source_provider
                  && readOnlySourceKeys.has(`${t.source_provider}:${t.external_source_id}`),
                )}
                className="h-5 w-5"
                style={{ accentColor: 'rgb(var(--color-accent))' }}
              />
              <span className={`todo-row__title ${t.done ? 'todo-row__title--done' : ''}`}>
                {t.title}
              </span>
              {t.source_provider && (
                <span className="resq-meta-chip">
                  {PROVIDER_LABEL[t.source_provider]}
                </span>
              )}
              {t.due_date && (
                <span className="resq-meta-chip">{formatDue(t.due_date, t.due_time)}</span>
              )}
              <span className="resq-meta-chip" style={{ borderColor: PRIORITY_COLOR[t.priority] }}>
                {PRIORITY_LABEL[t.priority]}
              </span>
              <button
                onClick={() => onDelete(t.id)}
                title={t.source_provider && readOnlySourceKeys.has(`${t.source_provider}:${t.external_source_id}`)
                  ? '읽기 전용 연결에서는 원본 앱에서 수정하세요.'
                  : undefined}
                disabled={pendingIds.has(t.id) || Boolean(
                  t.source_provider
                  && readOnlySourceKeys.has(`${t.source_provider}:${t.external_source_id}`),
                )}
                className="resq-text-action"
              >
                삭제
              </button>
            </li>
          ))}
          {sorted.length === 0 && (
            <li className="resq-empty-state">
              <span className="resq-empty-state__icon">
                <Inbox aria-hidden size={22} />
              </span>
              <div>
                <p className="resq-empty-state__title">등록된 할 일이 없습니다</p>
                <p className="resq-empty-state__body">위 입력창에서 오늘의 첫 할 일을 추가해 보세요.</p>
              </div>
            </li>
          )}
        </ul>}
      </div>
    </LiquidGlass>
  )
}
