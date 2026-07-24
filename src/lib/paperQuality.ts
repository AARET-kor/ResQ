import type { Paper } from './pubmed'
import { trustedJournalTier } from './sources'

export type EvidenceLevel = NonNullable<Paper['evidenceLevel']>

const LABEL: Record<EvidenceLevel, string> = {
  guideline: '가이드라인',
  'systematic-review': '체계적 문헌고찰',
  rct: '무작위 임상시험',
  'clinical-study': '임상 연구',
  review: '리뷰',
  other: '원저',
  preprint: '프리프린트',
}

export function evidenceLabel(level: EvidenceLevel | undefined): string | null {
  return level ? LABEL[level] : null
}

export function inferEvidenceLevel(types: string[] = [], source = ''): EvidenceLevel {
  if (source === 'PPR') return 'preprint'
  const value = types.join(' ').toLowerCase()
  if (/practice guideline|guideline/.test(value)) return 'guideline'
  if (/meta-analysis|systematic review/.test(value)) return 'systematic-review'
  if (/randomized controlled trial|controlled clinical trial/.test(value)) return 'rct'
  if (/clinical trial|observational study|cohort|case-control/.test(value)) return 'clinical-study'
  if (/review/.test(value)) return 'review'
  return 'other'
}

function ageInYears(paper: Paper, now: Date): number {
  const parsed = paper.date ? new Date(paper.date) : new Date(`${paper.year || '1970'}-07-01`)
  const milliseconds = Math.max(86_400_000, now.getTime() - parsed.getTime())
  return milliseconds / (365.25 * 86_400_000)
}

/**
 * Transparent discovery heuristic, not a claim about scientific validity.
 * It rewards indexing, stronger study types, trusted venues, citation velocity,
 * recency, and lawful full-text availability, while demoting preprints.
 */
export function scorePaper(paper: Paper, now = new Date()): Paper {
  const evidenceLevel = paper.evidenceLevel ??
    inferEvidenceLevel(paper.publicationTypes, paper.src)
  const signals: string[] = []
  let discoveryScore = 0

  if (paper.src === 'MED' || paper.sourceProvider === 'PubMed') {
    discoveryScore += 20
    signals.push('MEDLINE')
  }
  if (paper.abstract.trim()) discoveryScore += 8

  const evidencePoints: Record<EvidenceLevel, number> = {
    guideline: 28,
    'systematic-review': 26,
    rct: 24,
    'clinical-study': 14,
    review: 12,
    other: 8,
    preprint: -20,
  }
  discoveryScore += evidencePoints[evidenceLevel]
  if (evidenceLevel !== 'other') signals.push(LABEL[evidenceLevel])

  const journalTier = trustedJournalTier(paper.journal)
  if (journalTier === 1) {
    discoveryScore += 24
    signals.push('최상위 저널')
  } else if (journalTier === 2) {
    discoveryScore += 16
    signals.push('주요 전문지')
  } else if (journalTier === 3) {
    discoveryScore += 8
    signals.push('전문 학술지')
  }

  if (paper.isOpenAccess || paper.pmcid) {
    discoveryScore += 8
    signals.push('OA 원문')
  }

  const ageYears = ageInYears(paper, now)
  const citationsPerYear = (paper.citedByCount ?? 0) / Math.max(ageYears, 0.25)
  const citationPoints = Math.min(18, Math.log2(citationsPerYear + 1) * 4)
  const fwciPoints = paper.fwci && paper.fwci > 1
    ? Math.min(10, Math.log2(paper.fwci) * 4)
    : 0
  const recencyPoints = ageYears <= 0.25 ? 10 : ageYears <= 1 ? 7 : ageYears <= 3 ? 3 : 0
  discoveryScore += citationPoints + fwciPoints + recencyPoints

  if (citationsPerYear >= 10 || (paper.fwci ?? 0) >= 2) signals.push('인용 상승')
  if (ageYears <= 1) signals.push('최근 1년')
  if (paper.isRetracted) {
    discoveryScore = 0
    signals.splice(0, signals.length, '철회 논문')
  }

  return {
    ...paper,
    evidenceLevel,
    discoveryScore: Math.max(0, Math.min(100, Math.round(discoveryScore))),
    hotScore: Math.max(0, Math.round(citationsPerYear * 10 + (paper.fwci ?? 0) * 10)),
    qualitySignals: [...new Set(signals)].slice(0, 4),
  }
}

export function rankPapers(papers: Paper[], now = new Date()): Paper[] {
  return papers
    .filter((paper) => !paper.isRetracted && paper.title.trim() && paper.abstract.trim())
    .map((paper) => scorePaper(paper, now))
    .sort((a, b) => (b.discoveryScore ?? 0) - (a.discoveryScore ?? 0))
}

export function dedupePapers(papers: Paper[]): Paper[] {
  const seen = new Set<string>()
  return papers.filter((paper) => {
    const key = paper.doi?.toLowerCase() ||
      (paper.pmid ? `pmid:${paper.pmid}` : paper.title.toLowerCase().replace(/\W/g, ''))
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
