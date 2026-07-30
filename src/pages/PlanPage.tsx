import type { Profile } from '../lib/profile'
import { PageIntro } from '../components/PageIntro'
import { PlanWorkstation } from '../components/sections/PlanWorkstation'
import { useIntegrationSources } from '../home/hooks/useIntegrationSources'
import { usePlannerCapture } from '../home/hooks/usePlannerCapture'
import { useSchedule } from '../home/hooks/useSchedule'
import { useTodos } from '../home/hooks/useTodos'
import { monthRangeISO } from '../lib/calendar'
import { eventOccursInDateRange } from '../lib/planner'

export function PlanPage({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}) {
  const todos = useTodos({ profile, onProfileChange })
  const schedule = useSchedule(profile.id)
  const { sources, loading: sourcesLoading } = useIntegrationSources(profile.id)
  const plannerCapture = usePlannerCapture({
    specialty: profile.specialty,
    onAddEvent: schedule.add,
    onAddTodo: todos.add,
    onShowDate: (date) => {
      const [nextYear, nextMonth] = date.split('-').map(Number)
      schedule.changeMonth(nextYear, nextMonth - 1)
    },
  })
  const openTodoCount = todos.todos.filter((todo) => !todo.done).length
  const connectedSourceCount = sources.filter((source) => source.selected).length
  const monthRange = monthRangeISO(schedule.year, schedule.month0)
  const monthEventCount = schedule.events.filter((event) =>
    eventOccursInDateRange(event, monthRange.start, monthRange.end),
  ).length
  const writableSourceKeys = new Set(
    sources
      .filter((source) =>
        source.selected && source.can_write && source.sync_mode === 'two_way',
      )
      .map((source) => `${source.provider}:${source.external_id}`),
  )
  const externalItemSourceKeys = [
    ...schedule.events,
    ...todos.todos,
  ].flatMap((item) =>
    item.source_provider
      ? [
          `${item.source_provider}:${
            item.external_source_id ?? '__unresolved__'
          }`,
        ]
      : [],
  )
  const readOnlySourceKeys = new Set([
    ...sources
      .filter((source) => source.sync_mode === 'read_only' || !source.can_write)
      .map((source) => `${source.provider}:${source.external_id}`),
    ...externalItemSourceKeys.filter((key) =>
      sourcesLoading || !writableSourceKeys.has(key),
    ),
  ])

  return (
    <div className="plan-page">
      <PageIntro
        eyebrow="Personal workspace"
        title="일정 · 할 일"
        description="월간·주간·아젠다·Tasks 보기를 오가며 ResQ와 외부 앱의 일정과 할 일을 한 워크스테이션에서 관리합니다."
        action={(
          <div className="plan-summary" aria-label="일정 및 할 일 요약">
            <div className="plan-summary__item">
              <strong className="plan-summary__value">{openTodoCount}</strong>
              <span className="plan-summary__label">남은 할 일</span>
            </div>
            <div className="plan-summary__item">
              <strong className="plan-summary__value">{monthEventCount}</strong>
              <span className="plan-summary__label">이번 달 일정</span>
            </div>
            <div className="plan-summary__item">
              <strong className="plan-summary__value">{connectedSourceCount}</strong>
              <span className="plan-summary__label">연결된 소스</span>
            </div>
          </div>
        )}
      />
      <PlanWorkstation
        userId={profile.id}
        events={schedule.events}
        todos={todos.todos}
        sources={sources}
        year={schedule.year}
        month0={schedule.month0}
        onMonthChange={schedule.changeMonth}
        onAddEvent={schedule.add}
        onAddTodo={todos.add}
        onToggleTodo={todos.toggle}
        onDeleteEvent={schedule.remove}
        onDeleteTodo={todos.remove}
        addingEvent={schedule.adding}
        addingTodo={todos.adding}
        loadingEvents={schedule.loading}
        loadingTodos={todos.loading}
        loadingSources={sourcesLoading}
        deletingEventIds={schedule.deletingIds}
        pendingTodoIds={todos.pendingIds}
        readOnlySourceKeys={readOnlySourceKeys}
        plannerCapture={plannerCapture}
      />
    </div>
  )
}
