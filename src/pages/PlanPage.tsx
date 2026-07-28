import type { Profile } from '../lib/profile'
import { PageIntro } from '../components/PageIntro'
import { ScheduleSection } from '../components/sections/ScheduleSection'
import { TodoSection } from '../components/sections/TodoSection'
import { UnifiedTimeline } from '../components/sections/UnifiedTimeline'
import { useIntegrationSources } from '../home/hooks/useIntegrationSources'
import { useSchedule } from '../home/hooks/useSchedule'
import { useTodos } from '../home/hooks/useTodos'

export function PlanPage({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}) {
  const todos = useTodos({ profile, onProfileChange })
  const schedule = useSchedule(profile.id)
  const { sources } = useIntegrationSources(profile.id)
  const readOnlySourceKeys = new Set(
    sources
      .filter((source) => source.sync_mode === 'read_only')
      .map((source) => `${source.provider}:${source.external_id}`),
  )

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8 sm:py-14">
      <PageIntro
        eyebrow="Personal Command Center"
        title="일정 · 할 일"
        description="오늘 해야 할 일과 이번 달 일정을 한곳에서 관리합니다. 외부 앱에서 가져온 항목은 출처와 동기화 모드에 맞게 안전하게 처리됩니다."
      />
      <UnifiedTimeline
        events={schedule.events}
        todos={todos.todos}
        sources={sources}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <TodoSection
          todos={todos.todos}
          onAdd={todos.add}
          onToggle={todos.toggle}
          onDelete={todos.remove}
          onExtract={todos.extract}
          extracting={todos.extracting}
          extracted={todos.extracted}
          onAddExtracted={todos.addExtracted}
          onDismissExtracted={todos.dismissExtracted}
          loading={todos.loading}
          adding={todos.adding}
          addingExtracted={todos.addingExtracted}
          pendingIds={todos.pendingIds}
          readOnlySourceKeys={readOnlySourceKeys}
        />
        <ScheduleSection
          events={schedule.events}
          year={schedule.year}
          month0={schedule.month0}
          onMonthChange={schedule.changeMonth}
          onAdd={schedule.add}
          onDelete={schedule.remove}
          loading={schedule.loading}
          adding={schedule.adding}
          deletingIds={schedule.deletingIds}
          readOnlySourceKeys={readOnlySourceKeys}
        />
      </div>
    </div>
  )
}
