import { useState, type FormEvent } from 'react'
import { LiquidGlass } from '../LiquidGlass'
import type { Todo } from '../../lib/todos'

export function TodoSection({
  todos,
  onAdd,
  onToggle,
  onDelete,
}: {
  todos: Todo[]
  onAdd: (title: string) => void
  onToggle: (todo: Todo) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    onAdd(t)
    setTitle('')
  }

  return (
    <LiquidGlass className="rounded-[24px]">
      <div className="flex flex-col gap-4 p-6">
        <h3 className="font-grotesk text-2xl uppercase">할 일</h3>
        <form onSubmit={submit} className="flex gap-2">
          <input
            aria-label="할 일 추가"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 회진 준비"
            className="flex-1 rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon"
          />
          <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
            추가
          </button>
        </form>
        <ul className="flex flex-col gap-2">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
              <input
                type="checkbox"
                aria-label={t.title}
                checked={t.done}
                onChange={() => onToggle(t)}
                className="h-4 w-4 accent-[#6FFF00]"
              />
              <span className={`flex-1 font-mono text-sm ${t.done ? 'text-cream/40 line-through' : 'text-cream'}`}>
                {t.title}
              </span>
              {t.due_date && <span className="font-mono text-[10px] uppercase text-cream/50">{t.due_date}</span>}
              <button
                onClick={() => onDelete(t.id)}
                className="font-mono text-[10px] uppercase text-cream/40 transition hover:text-red-400"
              >
                삭제
              </button>
            </li>
          ))}
          {todos.length === 0 && (
            <li className="font-mono text-xs uppercase text-cream/40">할 일이 없습니다 — 큐비가 쉬는 중 🐾</li>
          )}
        </ul>
      </div>
    </LiquidGlass>
  )
}
