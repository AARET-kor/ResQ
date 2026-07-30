import { useState } from 'react'
import { BookOpenText, LibraryBig } from 'lucide-react'
import { PageIntro } from '../components/PageIntro'
import { PaperLibrary } from '../components/sections/PaperLibrary'
import { PaperReaderDialog } from '../components/sections/PaperReaderDialog'
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
  const [view, setView] = useState<'breakdown' | 'library'>('breakdown')
  const intro = view === 'breakdown'
    ? {
        eyebrow: 'Evidence Workspace',
        title: '논문 Breakdown',
        description: '주요 학회지와 학술지에서 논문을 선별하고, PDF 분석부터 연구 아이디어와 후속 논문 탐색까지 이어갑니다.',
      }
    : {
        eyebrow: 'Saved Research',
        title: '내 Research Library',
        description: '내가 분석한 논문과 PDF 리포트를 한눈에 펼쳐보고, 필요한 근거를 검색하고 다시 읽을 수 있는 개인 연구 서가입니다.',
      }

  return (
    <div className="mx-auto max-w-[1700px] px-5 py-10 sm:px-8 sm:py-14">
      <PageIntro
        eyebrow={intro.eyebrow}
        title={intro.title}
        description={intro.description}
      />

      <div
        className="mb-8 inline-flex w-full gap-1 rounded-[20px] border border-line bg-surface p-1.5 sm:w-auto"
        role="tablist"
        aria-label="논문 워크스페이스"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'breakdown'}
          aria-controls="paper-breakdown-view"
          onClick={() => setView('breakdown')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 font-sans text-sm font-bold transition sm:flex-none ${
            view === 'breakdown'
              ? 'bg-accent text-accentInk shadow-sm'
              : 'text-muted hover:bg-surfaceRaised hover:text-ink'
          }`}
        >
          <BookOpenText size={17} aria-hidden="true" />
          Breakdown
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'library'}
          aria-controls="paper-library-view"
          onClick={() => setView('library')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 font-sans text-sm font-bold transition sm:flex-none ${
            view === 'library'
              ? 'bg-accent text-accentInk shadow-sm'
              : 'text-muted hover:bg-surfaceRaised hover:text-ink'
          }`}
        >
          <LibraryBig size={17} aria-hidden="true" />
          내 Library
          <span
            className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
              view === 'library' ? 'bg-accentInk/15' : 'bg-surfaceRaised'
            }`}
          >
            {paperAnalysis.reports.length}
          </span>
        </button>
      </div>

      {view === 'breakdown' ? (
        <div id="paper-breakdown-view" role="tabpanel">
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
            analysisLoading={paperAnalysis.loading}
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
      ) : (
        <div id="paper-library-view" role="tabpanel">
          <PaperLibrary
            reports={paperAnalysis.reports}
            loading={paperAnalysis.reportsLoading}
            error={paperAnalysis.reportsError}
            onRetry={paperAnalysis.refreshReports}
            onOpenReport={paperAnalysis.openReport}
            onShowBreakdown={() => setView('breakdown')}
          />
        </div>
      )}

      <PaperReaderDialog
        selected={paperAnalysis.selected}
        selectedTitle={paperAnalysis.selectedTitle}
        analysis={paperAnalysis.analysis}
        analysisKind={paperAnalysis.analysisKind}
        analysisLoading={paperAnalysis.loading}
        analysisError={paperAnalysis.error}
        onAnalyze={paperAnalysis.analyze}
        onOpen={paperAnalysis.open}
        relatedPapers={paperAnalysis.relatedPapers}
        relatedLoading={paperAnalysis.relatedLoading}
        relatedError={paperAnalysis.relatedError}
        ideation={paperAnalysis.ideation}
        ideationLoading={paperAnalysis.ideationLoading}
        ideationError={paperAnalysis.ideationError}
        onGenerateIdeation={paperAnalysis.generateIdeation}
        onClose={paperAnalysis.close}
      />
    </div>
  )
}
