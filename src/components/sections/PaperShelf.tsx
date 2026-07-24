import type { Paper } from '../../lib/pubmed'
import { evidenceLabel } from '../../lib/paperQuality'
import { jifForJournal } from '../../lib/sources'

const COVERS = ['#7c5cff', '#0ea5e9', '#ec4899', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']

function coverColor(seed: string): string {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COVERS[h % COVERS.length]
}

export function PaperShelf({
  title,
  papers,
  onOpen,
  emptyNote = "'새 논문 불러오기'를 눌러 최신 논문을 가져오세요.",
  disabled = false,
}: {
  title: string
  papers: Paper[]
  onOpen: (p: Paper) => void
  emptyNote?: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-grotesk text-xl uppercase sm:text-2xl">{title}</h3>
      {papers.length === 0 ? (
        <p className="font-mono text-xs uppercase text-cream/40">{emptyNote}</p>
      ) : (
        <div className="shelf-scroll">
          {papers.map((p) => (
            <article
              key={`${p.src ?? 'MED'}-${p.pmid}`}
              onClick={() => { if (!disabled) onOpen(p) }}
              aria-disabled={disabled}
              className={`w-[170px] transition sm:w-[190px] ${
                disabled ? 'cursor-wait opacity-60' : 'cursor-pointer hover:-translate-y-1'
              }`}
            >
              {/* generated cover */}
              <div
                className="flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-xl p-3 shadow-lg"
                style={{ background: `linear-gradient(160deg, ${coverColor(p.journal || p.title)} 0%, #010828 130%)` }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="line-clamp-2 font-mono text-[9px] uppercase leading-tight text-white/80">
                    {p.journal || '기타'}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {(p.isOpenAccess || p.pmcid) && (
                      <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[9px] uppercase text-neon">OA 원문</span>
                    )}
                    {evidenceLabel(p.evidenceLevel) && (
                      <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[8px] text-white/90">
                        {evidenceLabel(p.evidenceLevel)}
                      </span>
                    )}
                  </span>
                </div>
                <p className="line-clamp-4 font-mono text-[13px] font-bold leading-snug text-white">
                  {p.title}
                </p>
                <div className="flex flex-col gap-1">
                  <div className="flex items-end justify-between">
                    <span className="font-mono text-[9px] text-white/70">{p.date ?? p.year}</span>
                    {(p.citedByCount ?? 0) > 0 && (
                      <span className="font-mono text-[9px] text-white/80">피인용 {p.citedByCount}</span>
                    )}
                  </div>
                  {jifForJournal(p.journal) != null && (
                    <span className="self-start rounded bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-white/90">
                      IF {jifForJournal(p.journal)}
                    </span>
                  )}
                  {p.discoveryScore != null && (
                    <span
                      title="MEDLINE 색인·연구 유형·저널 선별·인용·최신성·OA를 조합한 내부 추천 점수"
                      className="self-start rounded bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-white/90"
                    >
                      선별 {p.discoveryScore}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 line-clamp-1 font-mono text-[11px] text-cream/70">{p.authors || ' '}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
