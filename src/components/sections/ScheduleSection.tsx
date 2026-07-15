import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { LiquidGlass } from '../LiquidGlass'
import { monthGrid } from '../../lib/calendar'
import { EVENT_KINDS, type EventItem, type EventKind } from '../../lib/events'

const KIND_DOT: Record<EventKind, string> = {
  conference: '#6FFF00',
  surgery: '#ff6b6b',
  social: '#ffd166',
  professor: '#4ecdc4',
  other: '#c792ea',
}

export function ScheduleSection({
  events,
  year,
  month0,
  onMonthChange,
  onAdd,
  onDelete,
}: {
  events: EventItem[]
  year: number
  month0: number
  onMonthChange: (year: number, month0: number) => void
  onAdd: (v: { title: string; starts_at: string; kind: EventKind }) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [kind, setKind] = useState<EventKind>('other')

  const cells = monthGrid(year, month0)
  const byDate = new Map<string, EventItem[]>()
  for (const e of events) {
    const d = e.starts_at.slice(0, 10)
    byDate.set(d, [...(byDate.get(d) ?? []), e])
  }

  const prev = () => (month0 === 0 ? onMonthChange(year - 1, 11) : onMonthChange(year, month0 - 1))
  const next = () => (month0 === 11 ? onMonthChange(year + 1, 0) : onMonthChange(year, month0 + 1))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date || !time) return
    onAdd({ title: title.trim(), starts_at: `${date}T${time}:00+09:00`, kind })
    setTitle(''); setDate(''); setTime(''); setKind('other')
  }

  return (
    <LiquidGlass className="rounded-[24px]">
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-grotesk text-2xl uppercase">스케줄</h3>
          <div className="flex items-center gap-3">
            <button aria-label="이전 달" onClick={prev}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10">
              <ArrowLeft size={14} />
            </button>
            <span className="font-grotesk text-sm uppercase">{year}년 {month0 + 1}월</span>
            <button aria-label="다음 달" onClick={next}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10">
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7 gap-1 font-mono text-[10px] uppercase text-cream/50">
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
            <div key={d} className="px-1 py-0.5 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            const dayEvents = byDate.get(c.date) ?? []
            return (
              <div key={c.date}
                className={`min-h-[52px] rounded-md p-1 font-mono text-[11px] ${c.inMonth ? 'bg-white/5 text-cream' : 'bg-transparent text-cream/25'}`}>
                <div>{Number(c.date.slice(8, 10))}</div>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {dayEvents.map((e) => (
                    <span key={e.id} title={e.title}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: KIND_DOT[e.kind] }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Month event list */}
        <ul className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
              <span className="h-2 w-2 rounded-full" style={{ background: KIND_DOT[e.kind] }} />
              <span className="font-mono text-[10px] uppercase text-cream/60">
                {e.starts_at.slice(5, 10)} {e.starts_at.slice(11, 16)}
              </span>
              <span className="flex-1 font-mono text-sm">{e.title}</span>
              <span className="font-mono text-[10px] uppercase text-cream/50">{EVENT_KINDS[e.kind]}</span>
              <button aria-label="일정 삭제" onClick={() => onDelete(e.id)}
                className="font-mono text-[10px] uppercase text-cream/40 transition hover:text-red-400">
                삭제
              </button>
            </li>
          ))}
          {events.length === 0 && (
            <li className="font-mono text-xs uppercase text-cream/40">이 달의 일정이 없습니다</li>
          )}
        </ul>

        {/* Add form */}
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 min-w-[160px] flex-col gap-1 font-mono text-[10px] uppercase text-cream/60">
            일정 제목
            <input aria-label="일정 제목" value={title} onChange={(e) => setTitle(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-cream/60">
            날짜
            <input aria-label="날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-cream/60">
            시간
            <input aria-label="시간" type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-cream/60">
            종류
            <select aria-label="종류" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon [&>option]:bg-bg">
              {Object.entries(EVENT_KINDS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
            일정 추가
          </button>
        </form>
      </div>
    </LiquidGlass>
  )
}
