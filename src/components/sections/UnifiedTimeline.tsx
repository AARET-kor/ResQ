import {
  CalendarClock,
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
import { AppLink } from '../../app/AppLink'
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
    apple: 'AP',
    android: 'AN',
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
    <LiquidGlass className="plan-card timeline-card">
      <div className="plan-card__content">
        <header className="plan-card__header">
          <div className="plan-card__heading">
            <span className="plan-card__icon">
              <CalendarClock aria-hidden size={21} />
            </span>
            <div>
              <h2 className="plan-card__title">통합 타임라인</h2>
              <p className="plan-card__subtitle">
                ResQ·Google·Outlook·Todoist·Apple·Galaxy의 일정을 출처별로 모아봅니다.
              </p>
            </div>
          </div>
          <span className="plan-count">{items.length}개 항목</span>
        </header>

        {items.length > 0 ? <ol className="timeline-grid">
          {items.slice(0, 16).map((item) => (
            <li
              key={item.key}
              className={`timeline-item ${item.done ? 'timeline-item--done' : ''}`}
            >
              <span
                title={`${item.providerLabel} 출처`}
                aria-label={`${item.providerLabel} 출처`}
                className="timeline-provider-mark"
                style={{ backgroundColor: `${item.color}22`, borderColor: `${item.color}66` }}
              >
                {providerMark(item.provider)}
              </span>
              <div className="timeline-item__main">
                <div className="timeline-item__title">
                  <span className={item.done ? 'line-through' : ''}>
                    {item.title}
                  </span>
                  {item.duplicateCount > 1 && (
                    <span
                      title={`중복 출처: ${item.duplicateProviders.map(providerMark).join(', ')}`}
                      className="timeline-duplicate-chip"
                    >
                      <Link2 aria-hidden size={11} />
                      {item.duplicateProviders.map(providerMark).join('+')} · {item.duplicateCount}
                    </span>
                  )}
                </div>
                <div className="timeline-item__meta">
                  <span className="timeline-meta-chip">
                    {item.type === 'event'
                      ? <CalendarDays aria-hidden size={12} />
                      : <CheckCircle2 aria-hidden size={12} />}
                    {formatAt(item.at)}
                  </span>
                  <span
                    className="timeline-source-chip"
                    style={{
                      borderColor: `${providerColor(item.provider)}55`,
                    }}
                  >
                    {item.providerLabel}
                  </span>
                  <span className="timeline-meta-chip">
                    {item.syncMode === 'read_only'
                      ? <><LockKeyhole aria-hidden size={12} /> 읽기 전용</>
                      : <><RefreshCw aria-hidden size={12} /> 양방향</>}
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
                  className="timeline-external-link"
                >
                  <ExternalLink aria-hidden size={16} />
                </a>
              )}
            </li>
          ))}
        </ol> : (
          <div className="timeline-empty">
            <div className="timeline-empty__copy">
              <span className="timeline-empty__icon">
                <CalendarDays aria-hidden size={22} />
              </span>
              <div>
                <p className="resq-empty-state__title">아직 모인 일정이 없습니다</p>
                <p className="resq-empty-state__body">
                  첫 일정을 추가하거나 쓰고 있는 캘린더를 연결해 보세요.
                </p>
              </div>
            </div>
            <AppLink to="integrations" className="resq-secondary-button">
              연동 시작
            </AppLink>
          </div>
        )}
      </div>
    </LiquidGlass>
  )
}
