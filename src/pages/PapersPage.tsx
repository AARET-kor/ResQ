import { PageIntro } from '../components/PageIntro'
import { PapersSection } from '../components/sections/PapersSection'
import { usePaperAnalysis } from '../home/hooks/usePaperAnalysis'
import { usePaperFeed } from '../home/hooks/usePaperFeed'
import type { Profile } from '../lib/profile'
import { SPECIALTIES, SPECIALTY_ABBR } from '../mascot/roster'

export function PapersPage({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}) {
  const paperFeed = usePaperFeed({ profile, onProfileChange })
  const paperAnalysis = usePaperAnalysis({ profile, onProfileChange })

  return (
    <div className="mx-auto max-w-[1700px] px-5 py-10 sm:px-8 sm:py-14">
      <PageIntro
        eyebrow="Evidence Workspace"
        title="논문 Breakdown"
        description="주요 학회지와 학술지에서 논문을 선별하고, PDF 분석부터 연구 아이디어와 후속 논문 탐색까지 이어갑니다."
      />
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
        onAnalyze={paperAnalysis.analyze}
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
    </div>
  )
}
