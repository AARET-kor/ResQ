import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Plus,
  Rows3,
  Search,
  Sparkles,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { AppLink } from '../../../app/AppLink'
import {
  PROVIDER_LABEL,
  type IntegrationProvider,
} from '../../../lib/integrations'
import type {
  PlannerProviderFilter,
  PlannerView,
} from '../../../lib/planner'
import { PROVIDER_FALLBACK } from './workstationShared'

const VIEW_OPTIONS: Array<{
  id: PlannerView
  label: string
  Icon: typeof CalendarDays
}> = [
  { id: 'month', label: '월간', Icon: CalendarDays },
  { id: 'week', label: '주간', Icon: CalendarRange },
  { id: 'agenda', label: '아젠다', Icon: Rows3 },
  { id: 'tasks', label: 'Tasks', Icon: ListChecks },
]

export interface PlannerHeaderProps {
  view: PlannerView
  periodLabel: string
  query: string
  providerFilter: PlannerProviderFilter
  providers: IntegrationProvider[]
  onViewChange: (view: PlannerView) => void
  onQueryChange: (query: string) => void
  onProviderChange: (provider: PlannerProviderFilter) => void
  onNavigate: (direction: -1 | 1) => void
  onToday: () => void
  onQuickAdd: () => void
}

export function PlannerHeader({
  view,
  periodLabel,
  query,
  providerFilter,
  providers,
  onViewChange,
  onQueryChange,
  onProviderChange,
  onNavigate,
  onToday,
  onQuickAdd,
}: PlannerHeaderProps) {
  return (
    <>
      <header className="planner-toolbar">
        <div className="planner-toolbar__identity">
          <span className="plan-card__icon">
            <Sparkles aria-hidden size={21} />
          </span>
          <div>
            <p className="planner-kicker">All-in-one workspace</p>
            <h2 className="plan-card__title">ResQ 워크스테이션</h2>
          </div>
        </div>

        <div className="planner-view-switcher" aria-label="워크스테이션 보기">
          {VIEW_OPTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => onViewChange(id)}
              className={`planner-view-button ${
                view === id ? 'planner-view-button--active' : ''
              }`}
            >
              <Icon aria-hidden size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onQuickAdd}
          className="resq-primary-button planner-quick-add"
        >
          <Plus aria-hidden size={17} />
          통합 추가
        </button>
      </header>

      <div className="planner-commandbar">
        <div className="planner-date-nav">
          <button
            type="button"
            aria-label="이전 기간"
            onClick={() => onNavigate(-1)}
            className="resq-icon-control"
          >
            <ChevronLeft aria-hidden size={17} />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="planner-today-button"
          >
            오늘
          </button>
          <strong className="planner-period-label">{periodLabel}</strong>
          <button
            type="button"
            aria-label="다음 기간"
            onClick={() => onNavigate(1)}
            className="resq-icon-control"
          >
            <ChevronRight aria-hidden size={17} />
          </button>
        </div>

        <label className="planner-search">
          <Search aria-hidden size={16} />
          <span className="sr-only">일정과 할 일 검색</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="일정·할 일 검색"
          />
        </label>

        <div className="planner-provider-filters" aria-label="출처 필터">
          <button
            type="button"
            aria-pressed={providerFilter === 'all'}
            onClick={() => onProviderChange('all')}
            className={`planner-source-chip ${
              providerFilter === 'all' ? 'planner-source-chip--active' : ''
            }`}
          >
            전체
          </button>
          <button
            type="button"
            aria-pressed={providerFilter === 'resq'}
            onClick={() => onProviderChange('resq')}
            className={`planner-source-chip ${
              providerFilter === 'resq' ? 'planner-source-chip--active' : ''
            }`}
            style={{
              '--source-color': PROVIDER_FALLBACK.resq,
            } as CSSProperties}
          >
            ResQ
          </button>
          {providers.map((provider) => (
            <button
              key={provider}
              type="button"
              aria-pressed={providerFilter === provider}
              onClick={() => onProviderChange(provider)}
              className={`planner-source-chip ${
                providerFilter === provider
                  ? 'planner-source-chip--active'
                  : ''
              }`}
              style={{
                '--source-color': PROVIDER_FALLBACK[provider],
              } as CSSProperties}
            >
              {PROVIDER_LABEL[provider]}
            </button>
          ))}
        </div>

        <AppLink
          to="integrations"
          className="resq-secondary-button planner-connect-button"
        >
          연동 관리
        </AppLink>
      </div>
    </>
  )
}
