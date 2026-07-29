import type { Paper } from '../../lib/pubmed'
import { evidenceLabel } from '../../lib/paperQuality'
import { jifForJournal } from '../../lib/sources'

// Color now MEANS something: cover tone = evidence level (was a random
// journal-hash rainbow). Same level → same tone across every shelf.
const EVIDENCE_COVER: Record<string, string> = {
  guideline: '#0E7A5F',           // 가이드라인 — deep green
  'systematic-review': '#12766E', // 체계적 문헌고찰 — teal
  rct: '#1D6FB8',                 // 무작위 임상시험 — blue
  'clinical-study': '#28518F',    // 임상연구 — navy blue
  review: '#6D5BB8',              // 리뷰 — violet
  preprint: '#B7791F',            // 프리프린트 — amber (동료평가 전)
  other: '#3A4A6E',               // 원저/기타 — slate navy
}

function coverColor(level: string | undefined): string {
  return EVIDENCE_COVER[level ?? 'other'] ?? EVIDENCE_COVER.other
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
      <h3 className="font-serif text-xl font-black tracking-tight sm:text-2xl">{title}</h3>
      {papers.length === 0 ? (
        <p className="font-sans text-xs text-muted">{emptyNote}</p>
      ) : (
        <div className="shelf-scroll">
          {papers.map((p) => (
            <article
              key={`${p.src ?? 'MED'}-${p.pmid}`}
              onClick={() => { if (!disabled) onOpen(p) }}
              aria-disabled={disabled}
              className={`group w-[170px] transition sm:w-[190px] ${
                disabled ? 'cursor-wait opacity-60' : 'cursor-pointer hover:-translate-y-1'
              }`}
            >
              {/* generated cover */}
              <div
                className="flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-xl p-3 shadow-lg ring-1 ring-white/10 transition group-hover:ring-[#6FFF00]/50"
                style={{ background: `linear-gradient(168deg, ${coverColor(p.evidenceLevel)} 0%, #0A1030 125%)` }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="line-clamp-2 font-sans text-xs uppercase leading-tight text-white/80">
                    {p.journal || '기타'}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {(p.isOpenAccess || p.pmcid) && (
                      <span className="rounded bg-black/30 px-1.5 py-0.5 font-sans text-xs uppercase text-[#6FFF00]">OA 원문</span>
                    )}
                    {evidenceLabel(p.evidenceLevel) && (
                      <span className="rounded bg-black/30 px-1.5 py-0.5 font-sans text-xs text-white/90">
                        {evidenceLabel(p.evidenceLevel)}
                      </span>
                    )}
                  </span>
                </div>
                <p className="line-clamp-4 font-serif text-base font-bold leading-snug text-white">
                  {p.title}
                </p>
                <div className="flex flex-col gap-1">
                  <div className="flex items-end justify-between">
                    <span className="font-sans text-xs text-white/70">{p.date ?? p.year}</span>
                    {(p.citedByCount ?? 0) > 0 && (
                      <span className="font-sans text-xs text-white/80">피인용 {p.citedByCount}</span>
                    )}
                  </div>
                  {jifForJournal(p.journal) != null && (
                    <span className="self-start rounded bg-black/30 px-1.5 py-0.5 font-sans text-xs text-white/90">
                      IF {jifForJournal(p.journal)}
                    </span>
                  )}
                  {p.discoveryScore != null && (
                    <span
                      title="MEDLINE 색인·연구 유형·저널 선별·인용·최신성·OA를 조합한 내부 추천 점수"
                      className="self-start rounded bg-black/30 px-1.5 py-0.5 font-sans text-xs text-white/90"
                    >
                      선별 {p.discoveryScore}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 line-clamp-1 font-sans text-sm text-ink/70">{p.authors || ' '}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
