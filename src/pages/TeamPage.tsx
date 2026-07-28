import type { Profile } from '../lib/profile'
import { PageIntro } from '../components/PageIntro'
import { TeamSection } from '../components/sections/TeamSection'
import { useSchedule } from '../home/hooks/useSchedule'
import { useTeam } from '../home/hooks/useTeam'

export function TeamPage({ profile }: { profile: Profile }) {
  const team = useTeam(profile)
  const schedule = useSchedule(profile.id)

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8 sm:py-14">
      <PageIntro
        eyebrow="Shared Rounds"
        title="팀 미션"
        description="팀 과제, 담당자, 진행 상태와 변경 이력을 한 페이지에서 관리합니다. 학회 일정도 함께 보며 업무를 배분할 수 있습니다."
      />
      <TeamSection
        team={team.team}
        tasks={team.tasks}
        conferences={schedule.events.filter((event) => event.kind === 'conference')}
        onCreate={team.create}
        onJoin={team.join}
        onAddTask={team.addTask}
        onMove={team.moveTask}
        onDeleteTask={team.removeTask}
        loading={team.loading}
        busyAction={team.busyAction}
        pendingTaskIds={team.pendingTaskIds}
        currentUserId={profile.id}
        members={team.members}
        auditEvents={team.auditEvents}
        onChangeMemberRole={team.changeMemberRole}
        onRemoveMember={team.removeMember}
        onLeave={team.leave}
        onTransferOwnership={team.transferOwnership}
      />
    </div>
  )
}
