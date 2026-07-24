import { useEffect, useState } from 'react'
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
  relatedPapers = [], relatedLoading = false, relatedError = null,
  ideation = null, ideationLoading = false, ideationError = null, onGenerateIdeation,
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
  relatedPapers?: Paper[]
  relatedLoading?: boolean
  relatedError?: string | null
  ideation?: string | null
  ideationLoading?: boolean
  ideationError?: string | null
  onGenerateIdeation?: () => void
  /** All selectable specialties as {name, abbr}; empty hides the picker row. */
  specialtyOptions?: { name: string; abbr: string }[]
  /** Currently active feed specialties (primary first). */
  feed?: string[]
  /** The profile's primary specialty — always on, cannot be toggled off. */
  primary?: string | null
  onToggleSpecialty?: (name: string) => void
  specialtyNotice?: string | null
}) {
  const [drawerTab, setDrawerTab] = useState<'breakdown' | 'related' | 'ideation'>('breakdown')
  const isEmpty = shelves.every((s) => s.papers.length === 0)

  useEffect(() => {
    setDrawerTab('breakdown')
  }, [selected?.pmid])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase text-cream/60">
            검증된 의학 논문 · MEDLINE / Europe PMC / OpenAlex
          </p>
          <p className="mt-1 max-w-2xl font-mono text-[10px] leading-relaxed text-cream/40">
            추천 점수는 MEDLINE 색인, 연구 유형, 선별 저널, 인용 추세, 최신성, 합법적 원문 여부를 조합한 탐색용 지표입니다.
            개별 연구의 타당성이나 임상 권고 등급을 뜻하지 않습니다.
          </p>
        </div>
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
          <button onClick={onRefresh} disabled={loading}
            className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
            {loading ? '불러오는 중…' : '새 논문 불러오기'}
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
      {loading && (
        <div aria-label="논문 불러오는 중" className="flex animate-pulse gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-[230px] w-[170px] shrink-0 rounded-xl bg-white/10" />
          ))}
        </div>
      )}
      {!loading && isEmpty && !error && (
        <p className="font-mono text-xs uppercase text-cream/40">'새 논문 불러오기'를 눌러 전공 최신 논문을 가져오세요.</p>
      )}

      <div className="flex flex-col gap-10">
        {shelves.map((s) => (
          <PaperShelf
            key={s.label}
            title={s.label}
            papers={s.papers}
            onOpen={onOpen}
            disabled={analysisLoading}
          />
        ))}
      </div>

      <label className={`flex min-h-[120px] max-w-md flex-col items-center justify-center gap-2 rounded-[32px] border-2 border-dashed border-white/20 p-[18px] text-center transition ${
        analysisLoading ? 'cursor-wait opacity-50' : 'cursor-pointer hover:border-neon hover:bg-white/5'
      }`}>
        <span className="font-mono text-xs uppercase text-cream/60">
          {analysisLoading ? 'PDF 분석 중…' : 'PDF 업로드'}
        </span>
        <span className="font-mono text-[10px] text-cream/40">PDF 형식 · 최대 50MB</span>
        <input
          aria-label="PDF 업로드"
          type="file"
          accept="application/pdf"
          disabled={analysisLoading}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUploadPdf(file)
            e.target.value = ''
          }}
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
              <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#dfe9da] p-1">
                {([
                  ['breakdown', 'Breakdown'],
                  ['related', `연관 논문${relatedPapers.length ? ` ${relatedPapers.length}` : ''}`],
                  ['ideation', '연구 아이디에이션'],
                ] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDrawerTab(tab)}
                    className={`shrink-0 rounded-lg px-3 py-2 font-mono text-[11px] font-bold transition ${
                      drawerTab === tab
                        ? 'bg-white text-[#1f7a3f] shadow-sm'
                        : 'text-[#1c3325]/60 hover:text-[#1c3325]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {drawerTab === 'breakdown' && (
                <>
                  <div className="rounded-xl bg-white/70 p-4">
                    <h5 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#1f7a3f]">
                      8단계 근거 중심 Breakdown
                    </h5>
                    {analysisLoading && <p className="font-mono text-xs text-[#1c3325]/60">큐비가 논문을 분석하는 중… 🐾</p>}
                    {analysisError && (
                      <div className="flex flex-col gap-2 rounded-md border border-amber-400 bg-amber-50 p-3">
                        <p className="font-mono text-xs text-amber-900">{analysisError}</p>
                        {/서버|배포|ANTHROPIC/i.test(analysisError) && (
                          <p className="font-mono text-[11px] leading-relaxed text-amber-900/80">
                            관리자 설정 필요: 터미널에서{' '}
                            <code className="rounded bg-amber-900/10 px-1">supabase secrets set ANTHROPIC_API_KEY=발급받은키</code>
                            {' '}실행 후 다시 열면 분석이 표시됩니다.
                          </p>
                        )}
                      </div>
                    )}
                    {analysis && <p className="whitespace-pre-wrap font-mono text-[13px] leading-[1.8] text-[#1c3325]">{analysis}</p>}
                  </div>
                  <div className="rounded-xl bg-white/50 p-4">
                    <h5 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#1f7a3f]">
                      초록 · Abstract (EN)
                    </h5>
                    <p className="whitespace-pre-wrap font-mono text-[13px] leading-[1.8] text-[#1c3325]/85">
                      {selected.abstract || '(초록 없음)'}
                    </p>
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
                </>
              )}

              {drawerTab === 'related' && (
                <div className="rounded-xl bg-white/70 p-4">
                  <h5 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1f7a3f]">
                    인용·개념 그래프 기반 연관 논문
                  </h5>
                  <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#1c3325]/55">
                    OpenAlex의 관련 연구 그래프를 사용하며 철회 논문과 초록 없는 결과는 제외합니다.
                  </p>
                  {relatedLoading && <p className="mt-4 font-mono text-xs text-[#1c3325]/60">연관 논문을 찾는 중…</p>}
                  {relatedError && <p className="mt-4 font-mono text-xs text-amber-800">{relatedError}</p>}
                  {!relatedLoading && !relatedError && relatedPapers.length === 0 && (
                    <p className="mt-4 font-mono text-xs text-[#1c3325]/60">표시할 연관 논문이 없습니다.</p>
                  )}
                  <div className="mt-3 flex flex-col divide-y divide-[#1c3325]/10">
                    {relatedPapers.map((paper) => (
                      <button
                        key={`${paper.sourceProvider ?? 'source'}-${paper.pmid}`}
                        type="button"
                        onClick={() => onOpen(paper)}
                        disabled={analysisLoading}
                        className="flex flex-col gap-1 py-3 text-left transition hover:text-[#1f7a3f] disabled:cursor-wait disabled:opacity-50"
                      >
                        <span className="font-mono text-[12px] font-bold leading-relaxed">{paper.title}</span>
                        <span className="font-mono text-[10px] text-[#1c3325]/55">
                          {paper.journal || '학술지 미상'} · {paper.year || '연도 미상'}
                          {(paper.citedByCount ?? 0) > 0 && ` · 피인용 ${paper.citedByCount}`}
                          {paper.isOpenAccess && ' · OA'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {drawerTab === 'ideation' && (
                <div className="rounded-xl bg-white/70 p-4">
                  <h5 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1f7a3f]">
                    논문 근거 기반 연구 아이디에이션
                  </h5>
                  <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#1c3325]/55">
                    연구 공백, 검증 가능한 가설, PICO/PECO, 평가변수, 교란요인, 윤리·실패 기준을 구조화합니다.
                    생성 결과는 연구 기획 보조 자료이며 실제 선행연구 검토와 통계·IRB 검증이 필요합니다.
                  </p>
                  {!ideation && !ideationLoading && (
                    <button
                      type="button"
                      onClick={onGenerateIdeation}
                      disabled={!onGenerateIdeation || !selected.abstract}
                      className="mt-4 rounded-lg bg-[#1f7a3f] px-4 py-2 font-mono text-[11px] font-bold text-white transition hover:bg-[#176633] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      아이디에이션 생성
                    </button>
                  )}
                  {ideationLoading && <p className="mt-4 font-mono text-xs text-[#1c3325]/60">연구 질문과 설계를 만드는 중…</p>}
                  {ideationError && <p className="mt-4 font-mono text-xs text-amber-800">{ideationError}</p>}
                  {ideation && (
                    <>
                      <p className="mt-4 whitespace-pre-wrap font-mono text-[13px] leading-[1.8] text-[#1c3325]">{ideation}</p>
                      <a
                        download="resq-paper-ideation.md"
                        href={`data:text/markdown;charset=utf-8,${encodeURIComponent(ideation)}`}
                        className="mt-4 inline-block font-mono text-[10px] uppercase text-[#1f7a3f] underline"
                      >
                        아이디에이션 다운로드 (.md)
                      </a>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                {selected.oaUrl && (
                  <a href={selected.oaUrl} target="_blank" rel="noreferrer"
                    className="font-mono text-[10px] uppercase text-[#1f7a3f] underline">
                    Open Access 원문
                  </a>
                )}
                {selected.url && (
                  <a href={selected.url} target="_blank" rel="noreferrer"
                    className="font-mono text-[10px] uppercase text-[#1c3325]/60 underline transition hover:text-[#1f7a3f]">
                    논문 상세 보기
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
