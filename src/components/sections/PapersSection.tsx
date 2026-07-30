import { PaperShelf } from './PaperShelf'
import type { Paper } from '../../lib/pubmed'
import type { JournalSource } from '../../lib/sources'
import { SORT_LABEL, type PaperSortKey, type SortDir } from '../../lib/sortPapers'

export function PapersSection({
  shelves,
  loading,
  error,
  journals,
  selectedJournals,
  onToggleJournal,
  days,
  onDaysChange,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirChange,
  onRefresh,
  onOpen,
  onUploadPdf,
  analysisLoading,
  specialtyOptions = [],
  feed = [],
  primary = null,
  onToggleSpecialty,
  specialtyNotice = null,
}: {
  shelves: { label: string; papers: Paper[] }[]
  loading: boolean
  error: string | null
  journals: JournalSource[]
  selectedJournals: string[]
  onToggleJournal: (id: string) => void
  days: 7 | 30
  onDaysChange: (days: 7 | 30) => void
  sortKey: PaperSortKey
  sortDir: SortDir
  onSortKeyChange: (key: PaperSortKey) => void
  onSortDirChange: (direction: SortDir) => void
  onRefresh: () => void
  onOpen: (paper: Paper) => void
  onUploadPdf: (file: File) => void
  analysisLoading: boolean
  specialtyOptions?: { name: string; abbr: string }[]
  feed?: string[]
  primary?: string | null
  onToggleSpecialty?: (name: string) => void
  specialtyNotice?: string | null
}) {
  const isEmpty = shelves.every((shelf) => shelf.papers.length === 0)

  return (
    <section className="flex flex-col gap-7" aria-label="논문 Breakdown 탐색">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-sans text-sm font-bold text-ink">
            검증된 의학 논문 · MEDLINE / Europe PMC / OpenAlex
          </p>
          <p className="mt-1 max-w-2xl font-sans text-xs leading-relaxed text-muted">
            추천 점수는 MEDLINE 색인, 연구 유형, 선별 저널, 인용 추세, 최신성, 합법적 원문 여부를 조합한 탐색용 지표입니다.
            개별 연구의 타당성이나 임상 권고 등급을 뜻하지 않습니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {([7, 30] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => onDaysChange(period)}
              className={`rounded-full px-4 py-2.5 font-sans text-xs font-bold transition ${
                days === period
                  ? 'bg-accent text-accentInk'
                  : 'border border-line bg-surface text-muted hover:text-ink'
              }`}
            >
              최근 {period}일
            </button>
          ))}
          <select
            aria-label="정렬"
            value={sortKey}
            onChange={(event) => onSortKeyChange(event.target.value as PaperSortKey)}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 font-sans text-sm text-ink outline-none"
          >
            {Object.entries(SORT_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label="정렬 방향"
            onClick={() => onSortDirChange(sortDir === 'desc' ? 'asc' : 'desc')}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 font-sans text-sm text-muted transition hover:text-ink"
          >
            {sortDir === 'desc' ? '↓ 내림차순' : '↑ 오름차순'}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-black text-accentInk transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
          >
            {loading ? '불러오는 중…' : '새 논문 불러오기'}
          </button>
        </div>
      </div>

      {specialtyOptions.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <p className="font-sans text-xs font-semibold text-muted">
            전공 선택 — 선반이 전공별로 추가됩니다. 주전공은 고정됩니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {specialtyOptions.map((specialty) => {
              const active = feed.includes(specialty.name)
              const isPrimary = specialty.name === primary
              return (
                <button
                  key={specialty.name}
                  type="button"
                  onClick={() => !isPrimary && onToggleSpecialty?.(specialty.name)}
                  disabled={isPrimary}
                  title={isPrimary ? '주전공 (설정에서 변경)' : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 font-sans text-xs font-semibold transition ${
                    active
                      ? 'bg-accent text-accentInk'
                      : 'border border-line bg-surface text-muted hover:text-ink'
                  } ${isPrimary ? 'ring-1 ring-accent/50' : ''}`}
                >
                  {specialty.name}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                      active ? 'bg-accentInk/15' : 'bg-surfaceRaised'
                    }`}
                  >
                    {specialty.abbr}
                  </span>
                </button>
              )
            })}
          </div>
          {specialtyNotice && (
            <p className="font-sans text-xs font-semibold text-muted">{specialtyNotice}</p>
          )}
        </div>
      )}

      {journals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {journals.map((journal) =>
            journal.indexed === false ? (
              <a
                key={journal.id}
                href={journal.homepage}
                target="_blank"
                rel="noreferrer"
                title="국제 DB 미색인 — 학회지 사이트로 이동"
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 font-sans text-xs font-semibold text-muted transition hover:text-ink"
              >
                {journal.label} ↗
              </a>
            ) : (
              <button
                key={journal.id}
                type="button"
                onClick={() => onToggleJournal(journal.id)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 font-sans text-xs font-semibold transition ${
                  selectedJournals.includes(journal.id)
                    ? 'bg-accent text-accentInk'
                    : 'border border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                {journal.label}
                {journal.oa && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                      selectedJournals.includes(journal.id)
                        ? 'bg-accentInk/15'
                        : 'bg-surfaceRaised'
                    }`}
                  >
                    OA
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="font-sans text-sm text-ink">{error}</p>
        </div>
      )}
      {loading && (
        <div aria-label="논문 불러오는 중" className="flex animate-pulse gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-[230px] w-[170px] shrink-0 rounded-xl border border-line bg-surface"
            />
          ))}
        </div>
      )}
      {!loading && isEmpty && !error && (
        <p className="font-sans text-sm text-muted">
          ‘새 논문 불러오기’를 눌러 전공 최신 논문을 가져오세요.
        </p>
      )}

      <div className="flex flex-col gap-10">
        {shelves.map((shelf) => (
          <PaperShelf
            key={shelf.label}
            title={shelf.label}
            papers={shelf.papers}
            onOpen={onOpen}
            disabled={analysisLoading}
          />
        ))}
      </div>

      <label
        className={`flex min-h-[140px] max-w-lg flex-col items-center justify-center gap-2 rounded-[28px] border-2 border-dashed border-line bg-surface p-6 text-center transition ${
          analysisLoading
            ? 'cursor-wait opacity-50'
            : 'cursor-pointer hover:border-accent hover:bg-surfaceRaised'
        }`}
      >
        <span className="font-sans text-sm font-bold text-ink">
          {analysisLoading ? 'PDF 분석 중…' : 'PDF 업로드'}
        </span>
        <span className="font-sans text-xs text-muted">PDF 형식 · 최대 50MB</span>
        <input
          aria-label="PDF 업로드"
          type="file"
          accept="application/pdf"
          disabled={analysisLoading}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUploadPdf(file)
            event.target.value = ''
          }}
        />
      </label>
    </section>
  )
}
