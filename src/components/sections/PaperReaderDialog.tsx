import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Paper } from '../../lib/pubmed'
import { findOaCopy, scholarSearchUrl } from '../../lib/openAccess'
import { splitReportSections } from '../../lib/reportSections'

type AnalysisKind = 'abstract' | 'report'
type ReaderTab = 'breakdown' | 'related' | 'ideation'

interface PaperReaderDialogProps {
  selected: Paper | null
  selectedTitle: string | null
  analysis: string | null
  analysisKind: AnalysisKind | null
  analysisLoading: boolean
  analysisError: string | null
  onClose: () => void
  onAnalyze?: () => void
  onOpen: (paper: Paper) => void
  relatedPapers?: Paper[]
  relatedLoading?: boolean
  relatedError?: string | null
  ideation?: string | null
  ideationLoading?: boolean
  ideationError?: string | null
  onGenerateIdeation?: () => void
}

export function PaperReaderDialog({
  selected,
  selectedTitle,
  analysis,
  analysisKind,
  analysisLoading,
  analysisError,
  onClose,
  onAnalyze,
  onOpen,
  relatedPapers = [],
  relatedLoading = false,
  relatedError = null,
  ideation = null,
  ideationLoading = false,
  ideationError = null,
  onGenerateIdeation,
}: PaperReaderDialogProps) {
  const [drawerTab, setDrawerTab] = useState<ReaderTab>('breakdown')
  const [activeSection, setActiveSection] = useState(0)
  const [oa, setOa] = useState<{
    status: 'idle' | 'loading' | 'found' | 'none' | 'error'
    url?: string
  }>({ status: 'idle' })

  useEffect(() => {
    setDrawerTab('breakdown')
    setActiveSection(0)
    setOa({ status: 'idle' })
  }, [selected?.pmid])

  useEffect(() => {
    setActiveSection(0)
  }, [analysis])

  useEffect(() => {
    if (!selected) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, selected])

  if (!selected) return null

  const handleFindOa = async () => {
    if (!selected.doi) return
    setOa({ status: 'loading' })
    try {
      const copy = await findOaCopy(selected.doi)
      setOa(copy ? { status: 'found', url: copy.url } : { status: 'none' })
    } catch (oaError) {
      console.error(oaError)
      setOa({ status: 'error' })
    }
  }

  const reportSections = analysis ? splitReportSections(analysis) : []
  const visibleSection = reportSections[
    Math.min(activeSection, Math.max(reportSections.length - 1, 0))
  ]

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-reader-title"
    >
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-[24px] border border-line bg-canvas text-ink shadow-2xl">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="paper-reader-title"
                  className="font-serif text-xl font-black leading-snug text-ink sm:text-2xl"
                >
                  {selectedTitle ?? selected.title}
                </h2>
                {analysisKind === 'report' && (
                  <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 font-sans text-xs font-bold uppercase text-accent">
                    풀 리포트
                  </span>
                )}
              </div>
              <p className="mt-2 font-sans text-xs uppercase text-muted">
                {selected.journal || '출처 미상'} {selected.year && `· ${selected.year}`}
              </p>
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:bg-surfaceRaised hover:text-ink"
            >
              <X size={17} />
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1" role="tablist" aria-label="논문 리더 메뉴">
            {([
              ['breakdown', 'Breakdown'],
              ['related', `연관 논문${relatedPapers.length ? ` ${relatedPapers.length}` : ''}`],
              ['ideation', '연구 아이디에이션'],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={drawerTab === tab}
                onClick={() => setDrawerTab(tab)}
                className={`shrink-0 rounded-lg px-4 py-2.5 font-sans text-xs font-bold transition ${
                  drawerTab === tab
                    ? 'bg-surfaceRaised text-accent shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {drawerTab === 'breakdown' && (
            <>
              <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                <h3 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-accent">
                  초록 · Abstract (EN)
                </h3>
                <p className="whitespace-pre-wrap font-sans text-sm leading-7 text-ink">
                  {selected.abstract || '(초록 없음)'}
                </p>
              </section>

              {!analysis && !analysisLoading && !analysisError && onAnalyze && (
                <section className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-accent/35 bg-surface p-6 text-center">
                  <button
                    type="button"
                    onClick={onAnalyze}
                    className="rounded-full bg-accent px-8 py-3 font-sans text-base font-black tracking-wide text-accentInk shadow-md transition hover:scale-[1.02] hover:opacity-90"
                  >
                    AnalyzeQ · AI 분석 시작
                  </button>
                  <p className="max-w-xl font-sans text-sm leading-relaxed text-muted">
                    초록을 먼저 읽어보고, 준비되면 큐비에게 8단계 근거 중심 Breakdown을 맡기세요.
                    {selected.pmcid ? ' (원문 전체 분석 가능)' : ' (초록 기반 분석)'}
                  </p>
                </section>
              )}

              {(analysisLoading || analysisError || analysis) && (
                <section className="rounded-xl border border-line bg-surfaceRaised p-4 sm:p-5">
                  <h3 className="mb-3 font-sans text-xs font-bold uppercase tracking-wider text-accent">
                    8단계 근거 중심 Breakdown
                  </h3>
                  {analysisLoading && (
                    <p className="font-sans text-sm text-muted">큐비가 논문을 분석하는 중… 🐾</p>
                  )}
                  {analysisError && (
                    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
                      <p className="font-sans text-sm font-semibold text-ink">{analysisError}</p>
                      {/서버|배포|ANTHROPIC/i.test(analysisError) && (
                        <p className="font-sans text-xs leading-relaxed text-muted">
                          관리자 설정이 필요합니다. 분석 함수의 배포 상태와 API 키 설정을 확인해주세요.
                        </p>
                      )}
                    </div>
                  )}
                  {analysis && reportSections.length > 1 && (
                    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line pb-3">
                      {reportSections.map((section, index) => (
                        <button
                          key={`${section.title}-${index}`}
                          type="button"
                          onClick={() => setActiveSection(index)}
                          className={`shrink-0 rounded-md px-3 py-2 font-sans text-xs transition ${
                            activeSection === index
                              ? 'bg-accent font-bold text-accentInk'
                              : 'text-muted hover:bg-surface hover:text-ink'
                          }`}
                        >
                          {String(index + 1).padStart(2, '0')} {section.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {analysis && visibleSection && (
                    <p className="whitespace-pre-wrap font-sans text-sm leading-7 text-ink">
                      {reportSections.length > 1
                        ? `${visibleSection.title}\n\n${visibleSection.body}`
                        : analysis}
                    </p>
                  )}
                </section>
              )}

              <section className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
                <a
                  href={scholarSearchUrl(selected.title)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans text-xs text-muted underline transition hover:text-accent"
                >
                  Google Scholar에서 보기 ↗
                </a>
                {selected.oaUrl && (
                  <a
                    href={selected.oaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-sans text-xs font-bold text-accent underline"
                  >
                    무료 원문 열기 (OA) ↗
                  </a>
                )}
                {!selected.oaUrl && selected.doi && oa.status === 'idle' && (
                  <button
                    type="button"
                    onClick={handleFindOa}
                    className="rounded-md border border-accent/40 px-3 py-2 font-sans text-xs text-accent transition hover:bg-accent/10"
                  >
                    무료 원문 찾기 (Unpaywall)
                  </button>
                )}
                {oa.status === 'loading' && (
                  <span className="font-sans text-xs text-muted">합법 OA 사본 검색 중…</span>
                )}
                {oa.status === 'found' && oa.url && (
                  <a
                    href={oa.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-sans text-xs font-bold text-accent underline"
                  >
                    무료 원문 열기 (OA) ↗
                  </a>
                )}
                {oa.status === 'none' && (
                  <span className="font-sans text-xs text-muted">
                    무료 원문 없음 — 기관 도서관 또는 PDF 업로드를 이용하세요
                  </span>
                )}
                {oa.status === 'error' && (
                  <span className="font-sans text-xs text-muted">
                    OA 검색 실패 — 잠시 후 다시 시도해주세요
                  </span>
                )}
              </section>

              {analysis && (
                <a
                  download="resq-paper-report.md"
                  href={`data:text/markdown;charset=utf-8,${encodeURIComponent(analysis)}`}
                  className="font-sans text-xs uppercase text-accent underline"
                >
                  리포트 다운로드 (.md)
                </a>
              )}
            </>
          )}

          {drawerTab === 'related' && (
            <section className="rounded-xl border border-line bg-surfaceRaised p-4 sm:p-5">
              <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-accent">
                인용·개념 그래프 기반 연관 논문
              </h3>
              <p className="mt-2 font-sans text-xs leading-relaxed text-muted">
                OpenAlex의 관련 연구 그래프를 사용하며 철회 논문과 초록 없는 결과는 제외합니다.
              </p>
              {relatedLoading && (
                <p className="mt-4 font-sans text-sm text-muted">연관 논문을 찾는 중…</p>
              )}
              {relatedError && (
                <p className="mt-4 font-sans text-sm text-muted">{relatedError}</p>
              )}
              {!relatedLoading && !relatedError && relatedPapers.length === 0 && (
                <p className="mt-4 font-sans text-sm text-muted">표시할 연관 논문이 없습니다.</p>
              )}
              <div className="mt-3 flex flex-col divide-y divide-line">
                {relatedPapers.map((paper) => (
                  <button
                    key={`${paper.sourceProvider ?? 'source'}-${paper.pmid}`}
                    type="button"
                    onClick={() => onOpen(paper)}
                    disabled={analysisLoading}
                    className="flex flex-col gap-1.5 py-4 text-left transition hover:text-accent disabled:cursor-wait disabled:opacity-50"
                  >
                    <span className="font-serif text-base font-bold leading-relaxed">{paper.title}</span>
                    <span className="font-sans text-xs text-muted">
                      {paper.journal || '학술지 미상'} · {paper.year || '연도 미상'}
                      {(paper.citedByCount ?? 0) > 0 && ` · 피인용 ${paper.citedByCount}`}
                      {paper.isOpenAccess && ' · OA'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {drawerTab === 'ideation' && (
            <section className="rounded-xl border border-line bg-surfaceRaised p-4 sm:p-5">
              <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-accent">
                논문 근거 기반 연구 아이디에이션
              </h3>
              <p className="mt-2 font-sans text-xs leading-relaxed text-muted">
                연구 공백, 검증 가능한 가설, PICO/PECO, 평가변수, 교란요인, 윤리·실패 기준을 구조화합니다.
                생성 결과는 연구 기획 보조 자료이며 실제 선행연구 검토와 통계·IRB 검증이 필요합니다.
              </p>
              {!ideation && !ideationLoading && (
                <button
                  type="button"
                  onClick={onGenerateIdeation}
                  disabled={!onGenerateIdeation || !selected.abstract}
                  className="mt-4 rounded-lg bg-accent px-4 py-2.5 font-sans text-xs font-bold text-accentInk transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  아이디에이션 생성
                </button>
              )}
              {ideationLoading && (
                <p className="mt-4 font-sans text-sm text-muted">연구 질문과 설계를 만드는 중…</p>
              )}
              {ideationError && (
                <p className="mt-4 font-sans text-sm text-muted">{ideationError}</p>
              )}
              {ideation && (
                <>
                  <p className="mt-4 whitespace-pre-wrap font-sans text-sm leading-7 text-ink">
                    {ideation}
                  </p>
                  <a
                    download="resq-paper-ideation.md"
                    href={`data:text/markdown;charset=utf-8,${encodeURIComponent(ideation)}`}
                    className="mt-4 inline-block font-sans text-xs uppercase text-accent underline"
                  >
                    아이디에이션 다운로드 (.md)
                  </a>
                </>
              )}
            </section>
          )}

          <div className="flex flex-wrap gap-4">
            {selected.oaUrl && (
              <a
                href={selected.oaUrl}
                target="_blank"
                rel="noreferrer"
                className="font-sans text-xs uppercase text-accent underline"
              >
                Open Access 원문
              </a>
            )}
            {selected.url && (
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="font-sans text-xs uppercase text-muted underline transition hover:text-accent"
              >
                논문 상세 보기
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
