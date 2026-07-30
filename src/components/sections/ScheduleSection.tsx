import { useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CalendarRange, Inbox, Plus } from 'lucide-react'
import { LiquidGlass } from '../LiquidGlass'
import { monthGrid } from '../../lib/calendar'
import { EVENT_KINDS, type EventItem, type EventKind } from '../../lib/events'
import { PROVIDER_LABEL, type IntegrationSource } from '../../lib/integrations'
import {
  addDaysISO,
  eventDisplayRange,
  eventIsMultiDay,
  eventOccursOnDate,
  eventOccursInDateRange,
  kstDateISO,
  kstTimeHHMM,
  sourceForItem,
  todayKst,
} from '../../lib/planner'

const KIND_DOT: Record<EventKind, string> = {
  conference: '#238452',
  surgery: '#c54545',
  social: '#a56a00',
  professor: '#147f7c',
  other: '#7155a7',
}

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const MAX_CALENDAR_EVENTS = 2

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
      className="month-picker"
    >
      <div className="month-picker__header">
        <button
          aria-label="이전 해"
          type="button"
          onClick={() => setPickerYear((y) => y - 1)}
          className="resq-icon-control"
        >
          <ArrowLeft aria-hidden size={15} />
        </button>
        <span className="month-picker__year">{pickerYear}년</span>
        <button
          aria-label="다음 해"
          type="button"
          onClick={() => setPickerYear((y) => y + 1)}
          className="resq-icon-control"
        >
          <ArrowRight aria-hidden size={15} />
        </button>
      </div>
      <div className="month-picker__grid">
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
              className={`month-picker__month ${isCurrent ? 'month-picker__month--current' : ''}`}
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
  sources = [],
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
  sources?: IntegrationSource[]
  year: number
  month0: number
  onMonthChange: (year: number, month0: number) => void
  onAdd: (v: {
    title: string
    starts_at: string
    ends_at?: string | null
    kind: EventKind
  }) => boolean | void | Promise<boolean | void>
  onDelete: (id: string) => void
  loading?: boolean
  adding?: boolean
  deletingIds?: Set<string>
  readOnlySourceKeys?: Set<string>
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [kind, setKind] = useState<EventKind>('other')
  const [pickerOpen, setPickerOpen] = useState(false)

  const cells = monthGrid(year, month0)
  const monthStart = `${year}-${String(month0 + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(Date.UTC(year, month0 + 1, 1))
    .toISOString()
    .slice(0, 10)
  const monthEvents = events.filter((event) =>
    eventOccursInDateRange(event, monthStart, nextMonth),
  )

  const today = todayKst()

  const prev = () => (month0 === 0 ? onMonthChange(year - 1, 11) : onMonthChange(year, month0 - 1))
  const next = () => (month0 === 11 ? onMonthChange(year + 1, 0) : onMonthChange(year, month0 + 1))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date || !time || adding) return
    const saved = await onAdd({
      title: title.trim(),
      starts_at: `${date}T${time}:00+09:00`,
      ends_at: endDate ? `${endDate}T${time}:00+09:00` : null,
      kind,
    })
    if (saved === false) return
    setTitle(''); setDate(''); setTime(''); setEndDate(''); setKind('other')
  }

  return (
    <LiquidGlass className="plan-card schedule-card">
      <div className="plan-card__content">
        <header className="plan-card__header schedule-card__header">
          <div className="plan-card__heading">
            <span className="plan-card__icon">
              <CalendarDays aria-hidden size={21} />
            </span>
            <div>
              <h2 className="plan-card__title">캘린더</h2>
              <p className="plan-card__subtitle">한 달의 일정과 외부 캘린더 항목을 함께 확인하세요.</p>
            </div>
          </div>
          <div className="month-control">
            <button type="button" aria-label="이전 달" onClick={prev} className="resq-icon-control">
              <ArrowLeft aria-hidden size={17} />
            </button>
            <button
              type="button"
              aria-label="월 선택"
              onClick={() => setPickerOpen((v) => !v)}
              className="month-control__label"
            >
              {year}년 {month0 + 1}월
            </button>
            <button type="button" aria-label="다음 달" onClick={next} className="resq-icon-control">
              <ArrowRight aria-hidden size={17} />
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
        </header>

        <div className="calendar-weekdays" aria-hidden="true">
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
            <div
              key={d}
              className={`calendar-weekday ${
                d === '일' ? 'calendar-weekday--sun' : d === '토' ? 'calendar-weekday--sat' : ''
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="calendar-grid" aria-label={`${year}년 ${month0 + 1}월 달력`}>
          {cells.map((c) => {
            const dayEvents = events.filter((event) => eventOccursOnDate(event, c.date))
            const isToday = c.date === today
            return (
              <div
                key={c.date}
                className={`calendar-cell ${c.inMonth ? '' : 'calendar-cell--outside'}`}
              >
                <span className={`calendar-day-number ${isToday ? 'calendar-day-number--today' : ''}`}>
                  {Number(c.date.slice(8, 10))}
                </span>
                <div className="calendar-day-events">
                  {dayEvents.slice(0, MAX_CALENDAR_EVENTS).map((event) => (
                    <span
                      key={event.id}
                      title={event.title}
                      className={`calendar-event-chip ${
                        eventIsMultiDay(event) ? 'calendar-event-chip--span' : ''
                      }`}
                      style={{
                        '--event-color': sourceForItem(event, sources)?.color
                          ?? KIND_DOT[event.kind],
                      } as CSSProperties}
                    >
                      {eventIsMultiDay(event) && <CalendarRange aria-hidden size={10} />}
                      {event.title}
                    </span>
                  ))}
                  {dayEvents.length > MAX_CALENDAR_EVENTS && (
                    <span className="calendar-event-more">+{dayEvents.length - MAX_CALENDAR_EVENTS}개</span>
                  )}
                  {dayEvents.length > 0 && (
                    <span
                      className="calendar-mobile-count"
                      aria-label={`${dayEvents.length}개 일정`}
                    >
                      {dayEvents.length}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="schedule-list-heading">
          <span className="schedule-list-title">이번 달 일정</span>
          <span className="plan-count">{monthEvents.length}개</span>
        </div>

        {loading && (
          <div aria-label="일정 불러오는 중" className="flex animate-pulse flex-col gap-2">
            {[0, 1].map((item) => <div key={item} className="skeleton-line" />)}
          </div>
        )}
        {!loading && <ul className="schedule-event-list">
          {monthEvents.map((e) => (
            <li
              key={e.id}
              className="schedule-event-row"
              style={{
                borderLeft: `3px solid ${
                  sourceForItem(e, sources)?.color ?? KIND_DOT[e.kind]
                }`,
              }}
            >
              <span className="schedule-event-row__time">
                {kstDateISO(e.starts_at).slice(5)} {kstTimeHHMM(e.starts_at)}
                {eventIsMultiDay(e) && ` ~ ${eventDisplayRange(e).endDate.slice(5)}까지`}
              </span>
              <span className="schedule-event-row__title">{e.title}</span>
              {e.source_provider && (
                <span className="resq-meta-chip">
                  {PROVIDER_LABEL[e.source_provider]}
                </span>
              )}
              <span className="resq-meta-chip" style={{ borderColor: KIND_DOT[e.kind] }}>
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
                className="resq-text-action">
                삭제
              </button>
            </li>
          ))}
          {monthEvents.length === 0 && (
            <li className="resq-empty-state">
              <span className="resq-empty-state__icon">
                <Inbox aria-hidden size={22} />
              </span>
              <div>
                <p className="resq-empty-state__title">이 달의 일정이 없습니다</p>
                <p className="resq-empty-state__body">아래에서 일정을 추가하면 달력에 바로 표시됩니다.</p>
              </div>
            </li>
          )}
        </ul>}

        <form onSubmit={submit} className="schedule-composer">
          <label className="resq-field-label schedule-composer__title">
            일정 제목
            <input aria-label="일정 제목" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 학회 발표 준비"
              className="resq-field" />
          </label>
          <label className="resq-field-label">
            날짜
            <input aria-label="날짜" type="date" value={date} onChange={(e) => {
              setDate(e.target.value)
              if (endDate && endDate <= e.target.value) setEndDate('')
            }}
              className="resq-field" />
          </label>
          <label className="resq-field-label">
            시간
            <input aria-label="시간" type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="resq-field" />
          </label>
          <label className="resq-field-label">
            종류
            <select aria-label="종류" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}
              className="resq-select">
              {Object.entries(EVENT_KINDS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          <label className="resq-field-label">
            종료일 · 여러 날 일정
            <input
              aria-label="종료일"
              type="date"
              min={date ? addDaysISO(date, 1) : undefined}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="resq-field"
            />
          </label>
          <button type="submit" disabled={adding}
            className="resq-primary-button schedule-composer__submit">
            <Plus aria-hidden size={16} />
            {adding ? '추가 중…' : '일정 추가'}
          </button>
        </form>
      </div>
    </LiquidGlass>
  )
}
