import type { Paper } from './pubmed'
import { jifForJournal } from './sources'

export type PaperSortKey = 'recommended' | 'hot' | 'date' | 'cited' | 'jif'
export type SortDir = 'asc' | 'desc'

export const SORT_LABEL: Record<PaperSortKey, string> = {
  recommended: '추천순',
  hot: '화제성순',
  date: '최신순',
  cited: '피인용순',
  jif: 'IF순 (참고)',
}

/** Pure sort; unknown-JIF journals always sink to the end for the jif key. */
export function sortPapers(papers: Paper[], key: PaperSortKey, dir: SortDir): Paper[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...papers].sort((a, b) => {
    if (key === 'recommended') {
      return sign * ((a.discoveryScore ?? 0) - (b.discoveryScore ?? 0))
    }
    if (key === 'hot') return sign * ((a.hotScore ?? 0) - (b.hotScore ?? 0))
    if (key === 'jif') {
      const ja = jifForJournal(a.journal)
      const jb = jifForJournal(b.journal)
      if (ja == null && jb == null) return 0
      if (ja == null) return 1
      if (jb == null) return -1
      return sign * (ja - jb)
    }
    if (key === 'cited') return sign * ((a.citedByCount ?? 0) - (b.citedByCount ?? 0))
    // Day-level date when available (year alone made same-year sorts look inert).
    const da = a.date ?? `${a.year || '0000'}-00-00`
    const db = b.date ?? `${b.year || '0000'}-00-00`
    return sign * da.localeCompare(db)
  })
}
