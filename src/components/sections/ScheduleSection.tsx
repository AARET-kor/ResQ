import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { LiquidGlass } from '../LiquidGlass'
import { monthGrid } from '../../lib/calendar'
import { EVENT_KINDS, type EventItem, type EventKind } from '../../lib/events'
import { PROVIDER_LABEL } from '../../lib/integrations'

const KIND_DOT: Record<EventKind, string> = {
  conference: '#6FFF00',
  surgery: '#ff6b6b',
  social: '#ffd166',
  professor: '#4ecdc4',
  other: '#c792ea',
}

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const MAX_DOTS = 3

function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function MonthPicker({
  year,
  month0,
  onSelect,
  onClose,
}: {
  year: number
  month0: number
  onSelect: (y: number, m0: number) => void
  onClose: () => void
}) {
  const [pickerYear, setPickerYear] = useState(year)
  return (
    <div
      aria-label="월 선택 패널"
      className="absolute right-0 top-full z-10 mt-2 flex w-[260px] flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <button
          aria-label="이전 해"
          type="button"
          onClick={() => setPickerYear((y) => y - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-cream/30 transition hover:bg-cream/10"
        >
          <ArrowLeft size={12} />
        </button>
        <span className="font-grotesk text-sm uppercase">{pickerYear}년</span>
        <button
          aria-label="다음 해"
          type="button"
          onClick={() => setPickerYear((y) => y + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-cream/30 transition hover:bg-cream/10"
        >
          <ArrowRight size={12} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {MONTHS.map((label, m0) => {
          const isCurrent = pickerYear === year && m0 === month0
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                onSelect(pickerYear, m0)
                onClose()
              }}
              className={`rounded-md px-2 py-1.5 font-sans text-sm uppercase transition ${
                isCurrent ? 'bg-accent text-accentInk' : 'bg-cream/5 text-cream/70 hover:bg-cream/10'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ScheduleSection({
  events,
  year,
  month0,
  onMonthChange,
  onAdd,
  onDelete,
  loading = false,
  adding = false,
  deletingIds = new Set<string>(),
  readOnlySourceKeys = new Set<string>(),
}: {
  events: EventItem[]
  year: number
  month0: number
  onMonthChange: (year: number, month0: number) => void
  onAdd: (v: { title: string; starts_at: string; kind: EventKind }) => boolean | void | Promise<boolean | void>
  onDelete: (id: string) => void
  loading?: boolean
  adding?: boolean
  deletingIds?: Set<string>
  readOnlySourceKeys?: Set<string>
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [kind, setKind] = useState<EventKind>('other')
  const [pickerOpen, setPickerOpen] = useState(false)

  const cells = monthGrid(year, month0)
  const byDate = new Map<string, EventItem[]>()
  for (const e of events) {
    const d = e.starts_at.slice(0, 10)
    byDate.set(d, [...(byDate.get(d) ?? []), e])
  }

  const today = todayISO()

  const prev = () => (month0 === 0 ? onMonthChange(year - 1, 11) : onMonthChange(year, month0 - 1))
  const next = () => (month0 === 11 ? onMonthChange(year + 1, 0) : onMonthChange(year, month0 + 1))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date || !time || adding) return
    const saved = await onAdd({ title: title.trim(), starts_at: `${date}T${time}:00+09:00`, kind })
    if (saved === false) return
    setTitle(''); setDate(''); setTime(''); setKind('other')
  }

  return (
    <LiquidGlass className="rounded-2xl">
      <div className="flex flex-col gap-4 p-6 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-[6px] w-[6px] bg-neon" />
            <h3 className="font-grotesk text-xl uppercase">스케줄</h3>
          </div>
          <div className="relative flex items-center gap-3">
            <button aria-label="이전 달" onClick={prev}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-cream/30 transition hover:bg-cream/10">
              <ArrowLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="월 선택"
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded-md px-2 py-1 font-grotesk text-sm uppercase transition hover:bg-cream/10"
            >
              {year}년 {month0 + 1}월
            </button>
            <button aria-label="다음 달" onClick={next}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-cream/30 transition hover:bg-cream/10">
              <ArrowRight size={14} />
            </button>
            {pickerOpen && (
              <MonthPicker
                year={year}
                month0={month0}
                onSelect={onMonthChange}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7 gap-1 font-sans text-sm uppercase text-cream/70">
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
            <div
              key={d}
              className={`px-1 py-0.5 text-center ${d === '일' ? 'text-red-700 dark:text-red-300' : d === '토' ? 'text-sky-700 dark:text-sky-300' : ''}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            const dayEvents = byDate.get(c.date) ?? []
            const isToday = c.date === today
            return (
              <div key={c.date}
                className={`min-h-[64px] rounded-lg p-1 font-sans text-sm ${c.inMonth ? 'bg-cream/[0.07] text-cream' : 'bg-transparent text-muted'} ${isToday ? 'ring-2 ring-neon' : ''}`}>
                <div>{Number(c.date.slice(8, 10))}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
                  {dayEvents.slice(0, MAX_DOTS).map((e) => (
                    <span key={e.id} title={e.title}
                      className="h-2 w-2 rounded-full"
                      style={{ background: KIND_DOT[e.kind] }} />
                  ))}
                  {dayEvents.length > MAX_DOTS && (
                    <span className="font-sans text-xs text-cream/70">+{dayEvents.length - MAX_DOTS}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Month event list */}
        {loading && (
          <div aria-label="일정 불러오는 중" className="flex animate-pulse flex-col gap-2">
            {[0, 1].map((item) => <div key={item} className="h-9 rounded-md bg-cream/10" />)}
          </div>
        )}
        {!loading && <ul className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-md bg-cream/[0.07] px-3 py-2">
              <span className="font-sans text-sm uppercase text-cream/75">
                {e.starts_at.slice(5, 10)} {e.starts_at.slice(11, 16)}
              </span>
              <span className="flex-1 font-sans text-sm">{e.title}</span>
              {e.source_provider && (
                <span className="rounded-full border border-cream/15 px-2 py-0.5 font-sans text-xs uppercase text-cream/65">
                  {PROVIDER_LABEL[e.source_provider]}
                </span>
              )}
              <span className="font-sans text-sm uppercase" style={{ color: KIND_DOT[e.kind] }}>
                {EVENT_KINDS[e.kind]}
              </span>
              <button
                aria-label="일정 삭제"
                title={e.source_provider && readOnlySourceKeys.has(`${e.source_provider}:${e.external_source_id}`)
                  ? '읽기 전용 연결에서는 원본 앱에서 수정하세요.'
                  : undefined}
                onClick={() => onDelete(e.id)}
                disabled={deletingIds.has(e.id) || Boolean(
                  e.source_provider
                  && readOnlySourceKeys.has(`${e.source_provider}:${e.external_source_id}`),
                )}
                className="font-sans text-sm uppercase text-cream/65 transition hover:text-red-700 dark:hover:text-red-400 disabled:cursor-wait disabled:opacity-30">
                삭제
              </button>
            </li>
          ))}
          {events.length === 0 && (
            <li className="font-sans text-xs uppercase text-cream/65">이 달의 일정이 없습니다</li>
          )}
        </ul>}

        {/* Add form */}
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 min-w-[160px] flex-col gap-1 font-sans text-sm uppercase text-cream/75">
            일정 제목
            <input aria-label="일정 제목" value={title} onChange={(e) => setTitle(e.target.value)}
              className="rounded-md bg-cream/5 px-3 py-2 font-sans text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-sans text-sm uppercase text-cream/75">
            날짜
            <input aria-label="날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-md bg-cream/5 px-3 py-2 font-sans text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-sans text-sm uppercase text-cream/75">
            시간
            <input aria-label="시간" type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="rounded-md bg-cream/5 px-3 py-2 font-sans text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-sans text-sm uppercase text-cream/75">
            종류
            <select aria-label="종류" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}
              className="rounded-md bg-cream/5 px-3 py-2 font-sans text-sm text-cream outline-none focus:ring-1 focus:ring-neon [&>option]:bg-bg">
              {Object.entries(EVENT_KINDS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={adding}
            className="rounded-md bg-accent px-4 py-2 font-grotesk text-xs uppercase text-accentInk transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
            {adding ? '추가 중…' : '일정 추가'}
          </button>
        </form>
      </div>
    </LiquidGlass>
  )
}
