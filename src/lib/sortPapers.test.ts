import { describe, it, expect } from 'vitest'
import { sortPapers } from './sortPapers'
import type { Paper } from './pubmed'

const p = (o: Partial<Paper>): Paper => ({
  pmid: '1', pmcid: null, title: 't', journal: '', year: '2026', abstract: '', url: '', ...o,
})

describe('sortPapers', () => {
  const papers = [
    p({ pmid: 'a', year: '2024', citedByCount: 100, journal: 'Plast Reconstr Surg' }),
    p({ pmid: 'b', year: '2026', citedByCount: 2, journal: 'Unknown J' }),
    p({ pmid: 'c', year: '2025', citedByCount: 50, journal: 'J Am Acad Dermatol' }),
  ]
  it('sorts by date desc/asc', () => {
    expect(sortPapers(papers, 'date', 'desc').map((x) => x.pmid)).toEqual(['b', 'c', 'a'])
    expect(sortPapers(papers, 'date', 'asc').map((x) => x.pmid)).toEqual(['a', 'c', 'b'])
  })
  it('sorts by citations', () => {
    expect(sortPapers(papers, 'cited', 'desc').map((x) => x.pmid)).toEqual(['a', 'c', 'b'])
  })
  it('sorts by discovery and hot scores', () => {
    const scored = [
      p({ pmid: 'a', discoveryScore: 50, hotScore: 20 }),
      p({ pmid: 'b', discoveryScore: 90, hotScore: 10 }),
      p({ pmid: 'c', discoveryScore: 70, hotScore: 80 }),
    ]
    expect(sortPapers(scored, 'recommended', 'desc').map((x) => x.pmid)).toEqual(['b', 'c', 'a'])
    expect(sortPapers(scored, 'hot', 'desc').map((x) => x.pmid)).toEqual(['c', 'a', 'b'])
  })
  it('sorts by config JIF with unknown journals last regardless of direction', () => {
    expect(sortPapers(papers, 'jif', 'desc').map((x) => x.pmid)).toEqual(['c', 'a', 'b']) // 12.8 > 3.9 > unknown
    expect(sortPapers(papers, 'jif', 'asc').map((x) => x.pmid)).toEqual(['a', 'c', 'b'])  // 3.9 < 12.8, unknown last
  })
  it('sorts same-year papers by day-level date when available', () => {
    const sameYear = [
      p({ pmid: 'x', year: '2026', date: '2026-07-01' }),
      p({ pmid: 'y', year: '2026', date: '2026-07-15' }),
      p({ pmid: 'z', year: '2026', date: '2026-07-08' }),
    ]
    expect(sortPapers(sameYear, 'date', 'desc').map((q) => q.pmid)).toEqual(['y', 'z', 'x'])
    expect(sortPapers(sameYear, 'date', 'asc').map((q) => q.pmid)).toEqual(['x', 'z', 'y'])
  })

  it('does not mutate the input', () => {
    const before = papers.map((x) => x.pmid)
    sortPapers(papers, 'date', 'desc')
    expect(papers.map((x) => x.pmid)).toEqual(before)
  })
})
