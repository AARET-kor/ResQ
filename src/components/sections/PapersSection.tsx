import { X } from 'lucide-react'
import { PaperShelf } from './PaperShelf'
import type { Paper } from '../../lib/pubmed'
import type { PaperAnalysis } from '../../lib/papers'
import type { JournalSource } from '../../lib/sources'
import { SORT_LABEL, type PaperSortKey, type SortDir } from '../../lib/sortPapers'

export function PapersSection({
  shelves, loading, error,
  journals, selectedJournals, onToggleJournal, days, onDaysChange,
  sortKey, sortDir, onSortKeyChange, onSortDirChange,
  onRefresh, onOpen, onUploadPdf,
  reports, onOpenReport,
  selected, selectedTitle, analysis, analysisKind, analysisLoading, analysisError, onClose,
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
  onDaysChange: (d: 7 | 30) => void
  sortKey: PaperSortKey
  sortDir: SortDir
  onSortKeyChange: (k: PaperSortKey) => void
  onSortDirChange: (d: SortDir) => void
  onRefresh: () => void
  onOpen: (p: Paper) => void
  onUploadPdf: (file: File) => void
  reports: PaperAnalysis[]
  onOpenReport: (r: PaperAnalysis) => void
  selected: Paper | null
  selectedTitle: string | null
  analysis: string | null
  analysisKind: 'abstract' | 'report' | null
  analysisLoading: boolean
  analysisError: string | null
  onClose: () => void
  /** All selectable specialties as {name, abbr}; empty hides the picker row. */
  specialtyOptions?: { name: string; abbr: string }[]
  /** Currently active feed specialties (primary first). */
  feed?: string[]
  /** The profile's primary specialty — always on, cannot be toggled off. */
  primary?: string | null
  onToggleSpecialty?: (name: string) => void
  specialtyNotice?: string | null
}) {
  const isEmpty = shelves.every((s) => s.papers.length === 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-xs uppercase text-cream/60">전공 최신 논문 · Europe PMC</p>
        <div className="flex flex-wrap items-center gap-2">
          {([7, 30] as const).map((d) => (
            <button key={d} onClick={() => onDaysChange(d)}
              className={`rounded-md px-3 py-1.5 font-mono text-[11px] uppercase transition ${
                days === d ? 'bg-neon text-bg' : 'border border-white/20 text-cream/60 hover:bg-white/10'
              }`}>
              최근 {d}일
            </button>
          ))}
          <select aria-label="정렬" value={sortKey} onChange={(e) => onSortKeyChange(e.target.value as PaperSortKey)}
            className="rounded-md bg-white/5 px-3 py-2 font-mono text-xs text-cream outline-none [&>option]:bg-bg">
            {Object.entries(SORT_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button aria-label="정렬 방향" onClick={() => onSortDirChange(sortDir === 'desc' ? 'asc' : 'desc')}
            className="rounded-md border border-white/30 px-3 py-2 font-mono text-xs text-cream transition hover:bg-white/10">
            {sortDir === 'desc' ? '↓ 내림차순' : '↑ 오름차순'}
          </button>
          <button onClick={onRefresh}
            className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
            새 논문 불러오기
          </button>
        </div>
      </div>

      {specialtyOptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase text-cream/40">
            전공 선택 — 선반이 전공별로 추가됩니다 (주전공은 고정)
          </p>
          <div className="flex flex-wrap gap-2">
            {specialtyOptions.map((s) => {
              const active = feed.includes(s.name)
              const isPrimary = s.name === primary
              return (
                <button
                  key={s.name}
                  onClick={() => !isPrimary && onToggleSpecialty?.(s.name)}
                  disabled={isPrimary}
                  title={isPrimary ? '주전공 (설정에서 변경)' : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] transition ${
                    active
                      ? 'bg-neon text-bg'
                      : 'border border-white/20 text-cream/60 hover:bg-white/10'
                  } ${isPrimary ? 'ring-1 ring-white/50' : ''}`}
                >
                  {s.name}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase ${active ? 'bg-black/20' : 'bg-white/10'}`}>
                    {s.abbr}
                  </span>
                </button>
              )
            })}
          </div>
          {specialtyNotice && (
            <p className="font-mono text-[11px] text-yellow-400">{specialtyNotice}</p>
          )}
        </div>
      )}

      {journals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {journals.map((j) =>
            j.indexed === false ? (
              <a
                key={j.id}
                href={j.homepage}
                target="_blank"
                rel="noreferrer"
                title="국제 DB 미색인 — 학회지 사이트로 이동"
                className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 font-mono text-[11px] text-cream/60 transition hover:bg-white/10"
              >
                {j.label} ↗
              </a>
            ) : (
              <button key={j.id} onClick={() => onToggleJournal(j.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] transition ${
                  selectedJournals.includes(j.id)
                    ? 'bg-neon text-bg'
                    : 'border border-white/20 text-cream/60 hover:bg-white/10'
                }`}>
                {j.label}
                {j.oa && (
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] uppercase text-cream/80">
                    OA
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      )}

      {error && <p className="font-mono text-xs text-red-400">{error}</p>}
      {loading && <p className="font-mono text-xs uppercase text-cream/50">논문을 불러오는 중…</p>}
      {!loading && isEmpty && !error && (
        <p className="font-mono text-xs uppercase text-cream/40">'새 논문 불러오기'를 눌러 전공 최신 논문을 가져오세요.</p>
      )}

      <div className="flex flex-col gap-10">
        {shelves.map((s) => (
          <PaperShelf key={s.label} title={s.label} papers={s.papers} onOpen={onOpen} />
        ))}
      </div>

      <label className="flex min-h-[120px] max-w-md cursor-pointer flex-col items-center justify-center gap-2 rounded-[32px] border-2 border-dashed border-white/20 p-[18px] text-center transition hover:border-neon hover:bg-white/5">
        <span className="font-mono text-xs uppercase text-cream/60">PDF 업로드</span>
        <span className="font-mono text-[10px] text-cream/40">논문 PDF를 올려 전체 리포트를 생성하세요</span>
        <input
          aria-label="PDF 업로드"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onUploadPdf(e.target.files[0])}
        />
      </label>

      {reports.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-mono text-xs uppercase text-cream/60">내 레포트</h3>
          <div className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-[16px] border border-white/10">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenReport(r)}
                className="flex items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
              >
                <span className="font-mono text-xs">{r.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.source && <span className="font-mono text-[10px] uppercase text-cream/40">{r.source}</span>}
                  <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[9px] uppercase text-cream/60">
                    {r.kind === 'report' ? '풀 리포트' : '초록 분석'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Analysis drawer — light sage "reading mode" panel.
          NOTE: LiquidGlass forces overflow:hidden, which killed scrolling here;
          this plain panel owns its own overflow-y. */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[24px] bg-[#EFF5EC] text-[#1c3325] shadow-2xl">
            <div className="flex flex-col gap-5 p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-mono text-base font-bold leading-snug text-[#122619]">{selectedTitle ?? selected.title}</h4>
                    {analysisKind === 'report' && (
                      <span className="shrink-0 rounded-full bg-[#1f7a3f]/15 px-2 py-0.5 font-mono text-[10px] uppercase text-[#1f7a3f]">
                        풀 리포트
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[11px] uppercase text-[#1c3325]/60">{selected.journal} {selected.year && `· ${selected.year}`}</p>
                </div>
                <button aria-label="닫기" onClick={onClose}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1c3325]/25 text-[#1c3325] transition hover:bg-[#1c3325]/10">
                  <X size={14} />
                </button>
              </div>
              {/* KO 분석을 먼저, EN 원문 초록을 아래에 — 한/영 병기로 한눈에 */}
              <div className="rounded-xl bg-white/70 p-4">
                <h5 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#1f7a3f]">AI 분석 · 한국어 리포트</h5>
                {analysisLoading && <p className="font-mono text-xs text-[#1c3325]/60">큐비가 논문을 분석하는 중… 🐾</p>}
                {analysisError && (
                  <div className="flex flex-col gap-2 rounded-md border border-amber-400 bg-amber-50 p-3">
                    <p className="font-mono text-xs text-amber-900">{analysisError}</p>
                    {/서버|배포|ANTHROPIC/i.test(analysisError) && (
                      <p className="font-mono text-[11px] leading-relaxed text-amber-900/80">
                        관리자 설정 필요: 터미널에서{' '}
                        <code className="rounded bg-amber-900/10 px-1">supabase secrets set ANTHROPIC_API_KEY=발급받은키</code>
                        {' '}실행 후 다시 열면 한국어 분석이 표시됩니다.
                      </p>
                    )}
                  </div>
                )}
                {analysis && <p className="whitespace-pre-wrap font-mono text-[13px] leading-[1.8] text-[#1c3325]">{analysis}</p>}
              </div>
              <div className="rounded-xl bg-white/50 p-4">
                <h5 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#1f7a3f]">초록 · Abstract (EN)</h5>
                <p className="whitespace-pre-wrap font-mono text-[13px] leading-[1.8] text-[#1c3325]/85">{selected.abstract || '(초록 없음)'}</p>
              </div>
              {analysis && (
                <a
                  download="resq-paper-report.md"
                  href={`data:text/markdown;charset=utf-8,${encodeURIComponent(analysis)}`}
                  className="font-mono text-[10px] uppercase text-[#1f7a3f] underline"
                >
                  리포트 다운로드 (.md)
                </a>
              )}
              {selected.url && (
                <a href={selected.url} target="_blank" rel="noreferrer"
                  className="font-mono text-[10px] uppercase text-[#1c3325]/60 underline transition hover:text-[#1f7a3f]">
                  원문 보기
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
