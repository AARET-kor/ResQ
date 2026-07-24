import type { Profile } from '../lib/profile'
import { SPECIALTIES, SPECIALTY_ABBR } from '../mascot/roster'
import { TodoSection } from '../components/sections/TodoSection'
import { ScheduleSection } from '../components/sections/ScheduleSection'
import { SyncPanel } from '../components/sections/SyncPanel'
import { TeamSection } from '../components/sections/TeamSection'
import { PapersSection } from '../components/sections/PapersSection'
import { useTodos } from './hooks/useTodos'
import { useSchedule } from './hooks/useSchedule'
import { useGoogleIntegration } from './hooks/useGoogleIntegration'
import { useTeam } from './hooks/useTeam'
import { usePaperFeed } from './hooks/usePaperFeed'
import { usePaperAnalysis } from './hooks/usePaperAnalysis'

interface HomeSectionsProps {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}

/**
 * Home scroll sections below the hero.
 *
 * This component only connects feature hooks to their presentation sections.
 * Data loading and mutations live in the hooks under ./hooks.
 */
export function HomeSections({ profile, onProfileChange }: HomeSectionsProps) {
  const todos = useTodos({ profile, onProfileChange })
  const schedule = useSchedule(profile.id)
  const google = useGoogleIntegration({
    profile,
    onProfileChange,
    events: schedule.events,
    todos: todos.todos,
    onAddEvent: schedule.add,
    onEventSynced: schedule.markGoogleSynced,
  })
  const team = useTeam(profile)
  const paperFeed = usePaperFeed({ profile, onProfileChange })
  const paperAnalysis = usePaperAnalysis({ profile, onProfileChange })

  return (
    <div className="mx-auto flex max-w-[1831px] flex-col gap-16 px-6 py-16 sm:px-10">
      <section id="schedule" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          오늘의 <span className="font-condiment normal-case text-neon">plan</span>
        </h2>
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
          />
        </div>
        <div className="mt-6">
          <SyncPanel
            googleConnected={google.googleConnected}
            onSyncMonth={google.syncMonth}
            syncing={google.syncing}
            syncMessage={google.message}
            onDownloadIcs={google.downloadIcs}
            feedUrl={google.feedUrl}
            onScanGmail={google.scanGmail}
            scanning={google.scanning}
            extracted={google.extracted}
            addingExtracted={google.addingExtracted}
            onAddExtracted={google.addExtracted}
            onDismissExtracted={google.dismissExtracted}
            gmailConsentGranted={google.gmailConsentGranted}
            consentBusy={google.consentBusy}
            audits={google.audits}
            deletingAudits={google.deletingAudits}
            onGrantConsent={google.grantConsent}
            onRevokeConsent={google.revokeConsent}
            onDeleteAudits={google.deleteAudits}
          />
        </div>
      </section>

      <section id="team" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          팀 <span className="font-condiment normal-case text-neon">missions</span>
        </h2>
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
      </section>

      <section id="papers" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          논문 <span className="font-condiment normal-case text-neon">breakdown</span>
        </h2>
        <PapersSection
          shelves={paperFeed.shelves}
          loading={paperFeed.loading}
          error={paperFeed.error}
          journals={paperFeed.journals}
          selectedJournals={paperFeed.selectedJournals}
          onToggleJournal={paperFeed.toggleJournal}
          days={paperFeed.days}
          onDaysChange={paperFeed.setDays}
          sortKey={paperFeed.sortKey}
          sortDir={paperFeed.sortDir}
          onSortKeyChange={paperFeed.setSortKey}
          onSortDirChange={paperFeed.setSortDir}
          onRefresh={paperFeed.refresh}
          onOpen={paperAnalysis.open}
          onUploadPdf={paperAnalysis.uploadPdf}
          reports={paperAnalysis.reports}
          onOpenReport={paperAnalysis.openReport}
          selected={paperAnalysis.selected}
          selectedTitle={paperAnalysis.selectedTitle}
          analysis={paperAnalysis.analysis}
          analysisKind={paperAnalysis.analysisKind}
          analysisLoading={paperAnalysis.loading}
          analysisError={paperAnalysis.error}
          relatedPapers={paperAnalysis.relatedPapers}
          relatedLoading={paperAnalysis.relatedLoading}
          relatedError={paperAnalysis.relatedError}
          ideation={paperAnalysis.ideation}
          ideationLoading={paperAnalysis.ideationLoading}
          ideationError={paperAnalysis.ideationError}
          onGenerateIdeation={paperAnalysis.generateIdeation}
          onClose={paperAnalysis.close}
          specialtyOptions={SPECIALTIES.map((name) => ({
            name,
            abbr: SPECIALTY_ABBR[name] ?? '',
          }))}
          feed={paperFeed.feed}
          primary={profile.specialty}
          onToggleSpecialty={paperFeed.toggleSpecialty}
          specialtyNotice={paperFeed.specialtyNotice}
        />
      </section>
    </div>
  )
}
