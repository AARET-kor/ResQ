import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Link2,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react'
import type { EventItem } from '../../lib/events'
import type { IntegrationSource } from '../../lib/integrations'
import type { Todo } from '../../lib/todos'
import {
  buildUnifiedTimeline,
  providerColor,
  type UnifiedTimelineItem,
} from '../../lib/unifiedTimeline'
import { LiquidGlass } from '../LiquidGlass'

function formatAt(value: string | null): string {
  if (!value) return '날짜 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function providerMark(provider: UnifiedTimelineItem['provider']): string {
  return {
    resq: 'RQ',
    google: 'G',
    microsoft: 'MS',
    todoist: 'TD',
    apple: '',
    android: 'A',
    ics: 'ICS',
    caldav: 'DAV',
  }[provider]
}

export function UnifiedTimeline({
  events,
  todos,
  sources,
}: {
  events: EventItem[]
  todos: Todo[]
  sources: IntegrationSource[]
}) {
  const items = buildUnifiedTimeline(events, todos, sources)
  return (
    <LiquidGlass className="mb-6 rounded-2xl">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-[6px] w-[6px] bg-neon" />
              <h3 className="font-grotesk text-xl uppercase">통합 타임라인</h3>
            </div>
            <p className="mt-1 font-sans text-sm text-cream/65">
              ResQ·Google·Outlook·Todoist·Apple·Galaxy 일정을 중복 없이 표시합니다.
            </p>
          </div>
          <span className="font-sans text-sm text-cream/65">
            {items.length}개 항목
          </span>
        </div>
        <ol className="grid gap-2 lg:grid-cols-2">
          {items.slice(0, 16).map((item) => (
            <li
              key={item.key}
              className={`flex items-center gap-3 rounded-lg border border-cream/10 bg-cream/[0.05] px-3 py-3 ${
                item.done ? 'opacity-50' : ''
              }`}
            >
              <span
                title={`${item.providerLabel} 출처`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-sans text-xs font-semibold"
                style={{ backgroundColor: `${item.color}22`, color: item.color }}
              >
                {providerMark(item.provider)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate font-sans text-xs ${item.done ? 'line-through' : ''}`}>
                    {item.title}
                  </span>
                  {item.duplicateCount > 1 && (
                    <span
                      title={`중복 출처: ${item.duplicateProviders.map(providerMark).join(', ')}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-300/10 px-1.5 py-0.5 font-sans text-xs text-amber-800 dark:text-amber-200"
                    >
                      <Link2 size={9} />
                      {item.duplicateProviders.map(providerMark).join('+')} · {item.duplicateCount}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-sans text-xs text-cream/65">
                  <span className="inline-flex items-center gap-1">
                    {item.type === 'event'
                      ? <CalendarDays size={9} />
                      : <CheckCircle2 size={9} />}
                    {formatAt(item.at)}
                  </span>
                  <span
                    className="rounded-full border px-1.5 py-0.5"
                    style={{
                      borderColor: `${providerColor(item.provider)}55`,
                      color: providerColor(item.provider),
                    }}
                  >
                    {item.providerLabel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    {item.syncMode === 'read_only'
                      ? <><LockKeyhole size={9} /> 읽기 전용</>
                      : <><RefreshCw size={9} /> 양방향</>}
                  </span>
                </div>
              </div>
              {item.externalUrl && (
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${item.title} 원본 앱에서 열기`}
                  title="원본 앱에서 열기"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cream/15 text-cream/70 transition hover:border-neon/50 hover:text-neon"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </li>
          ))}
          {items.length === 0 && (
            <li className="font-sans text-xs text-cream/65">
              아직 표시할 일정이나 할 일이 없습니다.
            </li>
          )}
        </ol>
      </div>
    </LiquidGlass>
  )
}
