import { describe, expect, it } from 'vitest'
import type { Paper } from './pubmed'
import { dedupePapers, inferEvidenceLevel, rankPapers, scorePaper } from './paperQuality'

const base: Paper = {
  pmid: '1',
  doi: '10.1/a',
  title: 'Trial',
  journal: 'N Engl J Med',
  year: '2026',
  date: '2026-06-01',
  abstract: 'Background and methods',
  url: 'https://doi.org/10.1/a',
  pmcid: null,
  src: 'MED',
  publicationTypes: ['Randomized Controlled Trial'],
  citedByCount: 12,
}

describe('paper discovery quality', () => {
  it('recognizes evidence types', () => {
    expect(inferEvidenceLevel(['Practice Guideline'])).toBe('guideline')
    expect(inferEvidenceLevel(['Meta-Analysis'])).toBe('systematic-review')
    expect(inferEvidenceLevel(['Randomized Controlled Trial'])).toBe('rct')
    expect(inferEvidenceLevel([], 'PPR')).toBe('preprint')
  })

  it('scores indexed high-evidence papers above preprints', () => {
    const now = new Date('2026-07-24T00:00:00Z')
    const strong = scorePaper(base, now)
    const preprint = scorePaper({
      ...base,
      pmid: '2',
      doi: '10.1/b',
      journal: '프리프린트',
      src: 'PPR',
      publicationTypes: [],
      citedByCount: 0,
    }, now)
    expect(strong.discoveryScore).toBeGreaterThan(preprint.discoveryScore ?? 0)
    expect(strong.qualitySignals).toContain('최상위 저널')
  })

  it('removes retracted and abstract-less papers from ranked feeds', () => {
    expect(rankPapers([
      base,
      { ...base, pmid: '2', doi: '10.1/b', isRetracted: true },
      { ...base, pmid: '3', doi: '10.1/c', abstract: '' },
    ], new Date('2026-07-24'))).toHaveLength(1)
  })

  it('deduplicates by DOI before title', () => {
    expect(dedupePapers([base, { ...base, pmid: '2' }])).toHaveLength(1)
  })
})
