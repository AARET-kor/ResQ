import { ArrowRight, X } from 'lucide-react'
import { LiquidGlass } from '../LiquidGlass'
import type { Paper } from '../../lib/pubmed'

export function PapersSection({
  papers, loading, error, onRefresh, onOpen,
  selected, analysis, analysisLoading, analysisError, onClose,
}: {
  papers: Paper[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  onOpen: (p: Paper) => void
  selected: Paper | null
  analysis: string | null
  analysisLoading: boolean
  analysisError: string | null
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase text-cream/60">전공 최신 논문 · PubMed</p>
        <button onClick={onRefresh}
          className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
          새 논문 불러오기
        </button>
      </div>

      {error && <p className="font-mono text-xs text-red-400">{error}</p>}
      {loading && <p className="font-mono text-xs uppercase text-cream/50">논문을 불러오는 중…</p>}
      {!loading && papers.length === 0 && !error && (
        <p className="font-mono text-xs uppercase text-cream/40">'새 논문 불러오기'를 눌러 전공 최신 논문을 가져오세요.</p>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {papers.map((p) => (
          <LiquidGlass key={p.pmid} className="rounded-[32px] transition hover:bg-white/10">
            <article className="flex h-full flex-col gap-3 p-[18px]">
              <h4 className="font-mono text-sm font-bold leading-snug">{p.title}</h4>
              <p className="font-mono text-[11px] uppercase text-cream/60">
                {p.journal} {p.year && `· ${p.year}`}
              </p>
              <p className="line-clamp-3 font-mono text-xs text-cream/70">{p.abstract || '(초록 없음)'}</p>
              <div className="mt-auto flex items-center justify-between">
                <a href={p.url} target="_blank" rel="noreferrer"
                  className="font-mono text-[10px] uppercase text-cream/50 underline transition hover:text-neon">
                  PubMed
                </a>
                <button aria-label="AI 분석 열기" onClick={() => onOpen(p)}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#b724ff] to-[#7c3aed] shadow-lg shadow-purple-500/50 transition hover:scale-110">
                  <ArrowRight size={20} />
                </button>
              </div>
            </article>
          </LiquidGlass>
        ))}
      </div>

      {/* Analysis drawer */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog">
          <LiquidGlass className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[24px] !bg-[#0a1240]/95">
            <div className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-mono text-base font-bold">{selected.title}</h4>
                  <p className="font-mono text-[11px] uppercase text-cream/60">{selected.journal} {selected.year && `· ${selected.year}`}</p>
                </div>
                <button aria-label="닫기" onClick={onClose}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10">
                  <X size={14} />
                </button>
              </div>
              <div>
                <h5 className="mb-1 font-mono text-[11px] uppercase text-neon">초록</h5>
                <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-cream/80">{selected.abstract || '(초록 없음)'}</p>
              </div>
              <div>
                <h5 className="mb-1 font-mono text-[11px] uppercase text-neon">AI 분석 · breakdown</h5>
                {analysisLoading && <p className="font-mono text-xs text-cream/50">큐비가 논문을 분석하는 중… 🐾</p>}
                {analysisError && <p className="font-mono text-xs text-yellow-400">{analysisError}</p>}
                {analysis && <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-cream">{analysis}</p>}
              </div>
              <a href={selected.url} target="_blank" rel="noreferrer"
                className="font-mono text-[10px] uppercase text-cream/50 underline transition hover:text-neon">
                PubMed에서 원문 보기
              </a>
            </div>
          </LiquidGlass>
        </div>
      )}
    </div>
  )
}
