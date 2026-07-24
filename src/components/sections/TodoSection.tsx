import { useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { Mic } from 'lucide-react'
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

  return (
    <LiquidGlass className="rounded-2xl border border-white/15 bg-[#0B1433]">
      <div className="flex flex-col gap-4 p-6 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="h-[6px] w-[6px] bg-neon" />
          <h3 className="font-grotesk text-xl uppercase">할 일</h3>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              aria-label="할 일 추가"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 회진 준비"
              className="flex-1 rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon"
            />
            {SpeechRecognitionCtor && (
              <button
                type="button"
                aria-label="음성 입력"
                onClick={handleMicClick}
                className={`flex h-9 w-9 items-center justify-center rounded-md border border-white/30 text-cream transition hover:bg-white/10 ${listening ? 'animate-pulse text-neon' : ''}`}
              >
                <Mic size={16} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRIORITIES.map((p) => {
              const selected = priority === p
              return (
                <button
                  key={p}
                  type="button"
                  aria-label={`우선순위 ${PRIORITY_LABEL[p]}`}
                  aria-pressed={selected}
                  onClick={() => setPriority(p)}
                  style={selected ? { background: PRIORITY_COLOR[p], borderColor: PRIORITY_COLOR[p] } : undefined}
                  className={`rounded-md border px-3 py-1 font-mono text-[11px] uppercase transition ${
                    selected ? 'text-bg' : 'border-white/30 text-cream/70 hover:bg-white/10'
                  }`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              )
            })}
            <input
              aria-label="마감일"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-cream outline-none focus:ring-1 focus:ring-neon"
            />
            <input
              aria-label="마감 시간"
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-cream outline-none focus:ring-1 focus:ring-neon"
            />
            <button type="submit" disabled={adding}
              className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
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
          className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-white/25 px-4 py-3 text-center font-mono text-[11px] text-cream/50 outline-none focus:ring-1 focus:ring-neon"
        >
          {extracting ? 'AI가 할일을 뽑는 중…' : '메모/사진 붙여넣기 → AI가 할일 생성'}
        </div>

        {extracted.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md bg-white/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-cream/50">추출된 할일</span>
              <button
                onClick={onDismissExtracted}
                className="font-mono text-[10px] uppercase text-cream/40 transition hover:text-cream"
              >
                닫기
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {extracted.map((t, i) => (
                <li key={i} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
                  <span className="flex-1 font-mono text-sm">{t.title}</span>
                  {t.due_date && (
                    <span className="font-mono text-[10px] uppercase text-cream/50">{formatDue(t.due_date, t.due_time)}</span>
                  )}
                  <span className="font-mono text-[10px] uppercase text-cream/50">{PRIORITY_LABEL[t.priority]}</span>
                  <button
                    onClick={() => onAddExtracted?.(t)}
                    disabled={addingExtracted}
                    className="rounded-md border border-white/30 px-3 py-1 font-grotesk text-[10px] uppercase text-cream transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
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
            {[0, 1, 2].map((item) => <div key={item} className="h-9 rounded-md bg-white/10" />)}
          </div>
        )}
        {!loading && <ul className="flex flex-col gap-2">
          {sorted.map((t) => (
            <li
              key={t.id}
              style={{ borderLeft: `3px solid ${PRIORITY_COLOR[t.priority]}` }}
              className={`flex items-center gap-3 rounded-md bg-white/5 py-2 pl-3 pr-3 ${t.done ? 'opacity-50' : ''}`}
            >
              <input
                type="checkbox"
                aria-label={t.title}
                checked={t.done}
                onChange={() => onToggle(t)}
                disabled={pendingIds.has(t.id)}
                className="h-4 w-4 accent-[#6FFF00]"
              />
              <span className={`flex-1 font-mono text-sm ${t.done ? 'text-cream/40 line-through' : 'text-cream'}`}>
                {t.title}
              </span>
              {t.source_provider && (
                <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[9px] uppercase text-cream/45">
                  {PROVIDER_LABEL[t.source_provider]}
                </span>
              )}
              {t.due_date && (
                <span className="font-mono text-[10px] uppercase text-cream/50">{formatDue(t.due_date, t.due_time)}</span>
              )}
              <span className="font-mono text-[10px] uppercase" style={{ color: PRIORITY_COLOR[t.priority] }}>
                {PRIORITY_LABEL[t.priority]}
              </span>
              <button
                onClick={() => onDelete(t.id)}
                disabled={pendingIds.has(t.id)}
                className="font-mono text-[10px] uppercase text-cream/40 transition hover:text-red-400 disabled:cursor-wait disabled:opacity-30"
              >
                삭제
              </button>
            </li>
          ))}
          {sorted.length === 0 && (
            <li className="font-mono text-xs uppercase text-cream/40">할 일이 없습니다 — 큐비가 쉬는 중 🐾</li>
          )}
        </ul>}
      </div>
    </LiquidGlass>
  )
}
