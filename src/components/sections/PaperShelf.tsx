import type { Paper } from '../../lib/pubmed'

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
}: {
  title: string
  papers: Paper[]
  onOpen: (p: Paper) => void
  emptyNote?: string
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
              onClick={() => onOpen(p)}
              className="w-[170px] cursor-pointer transition hover:-translate-y-1 sm:w-[190px]"
            >
              {/* generated cover */}
              <div
                className="flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-xl p-3 shadow-lg"
                style={{ background: `linear-gradient(160deg, ${coverColor(p.journal || p.title)} 0%, #010828 130%)` }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-mono text-[9px] uppercase leading-tight text-white/80">
                    {p.journal || '기타'}
                  </span>
                  {p.pmcid && (
                    <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[9px] uppercase text-neon">원문</span>
                  )}
                </div>
                <p className="line-clamp-4 font-mono text-[13px] font-bold leading-snug text-white">
                  {p.title}
                </p>
                <div className="flex items-end justify-between">
                  <span className="font-mono text-[9px] text-white/70">{p.year}</span>
                  {(p.citedByCount ?? 0) > 0 && (
                    <span className="font-mono text-[9px] text-white/80">피인용 {p.citedByCount}</span>
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
