# ResQ Papers v3 Implementation Plan (밀리 스타일 서재 + Europe PMC + 정렬 + 전공 설정)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the papers section as a clean bookshelf (밀리의서재 layout language on the dark theme): per-specialty horizontal shelves of generated "cover" cards, Europe PMC as the paper source (PubMed + preprints + PMC, real citation counts), sorting by 최신/피인용/IF(config) with asc/desc, and an in-app Settings modal to change 전공 + multi-select 관심 전공 (성형외과·피부과 …).

**Architecture:** New `src/lib/europepmc.ts` (search + OA fullTextXML, injectable fetcher) maps results into the existing `Paper` shape extended with `authors`/`citedByCount`/`src`. `sources.ts` gains 피부과 journals and public-JCR `jif` config values; pure `sortPapers` orders shelves client-side. `profiles.interests` (comma text, migration 0008) + `SettingsModal` (opened from the Hero nav 설정) manage specialties. `PaperShelf`/`PaperCover` render horizontal snap-scroll shelves; `PapersSection` v3 composes controls + one shelf per specialty + 내 레포트 shelf. Existing drawer/report/PDF/XP flows unchanged (fulltext now via Europe PMC `PMC{id}/fullTextXML`, falling back to the existing NCBI fetch).

**Tech Stack:** unchanged, no new deps.
**Branch:** `feat/home-sections`.

---

## File Structure

```
supabase/migrations/0008_interests.sql
src/lib/europepmc.ts (+test)        # search/map/fulltext via Europe PMC
src/lib/pubmed.ts                    # export extractBodyText (shared XML body parser)
src/lib/sortPapers.ts (+test)        # date|cited|jif × asc|desc
src/lib/sources.ts (+test upd)       # + jif values, + 피부과 registry
src/lib/profile.ts                   # + interests?: string | null (+ helpers)
src/components/SettingsModal.tsx (+test)
src/components/Hero.tsx              # 설정 → onOpenSettings
src/components/sections/PaperShelf.tsx (+test)   # shelf + cover cards
src/components/sections/PapersSection.tsx (+test upd)  # v3 composition
src/home/HomeSections.tsx            # multi-specialty fetch + sort wiring
src/App.tsx                          # settings modal state
src/index.css                        # .shelf-scroll utility
```

---

### Task 1: Migration + profile interests + sources v2 (jif + 피부과)

**Files:** create `supabase/migrations/0008_interests.sql`; modify `src/lib/profile.ts`, `src/lib/sources.ts`, `src/lib/sources.test.ts`

- [ ] **Step 1: Migration** (do NOT apply):

```sql
-- Papers v3: multi-specialty interests. Re-runnable.
alter table public.profiles
  add column if not exists interests text; -- comma-separated specialty names
```

- [ ] **Step 2: profile.ts** — `Profile` gains `interests?: string | null`; add pure helpers:

```ts
/** "성형외과,피부과" → ['성형외과','피부과'] (trimmed, deduped, empty-safe). */
export function parseInterests(interests: string | null | undefined): string[] {
  if (!interests) return []
  return [...new Set(interests.split(',').map((s) => s.trim()).filter(Boolean))]
}

/** The user's paper feed specialties: primary first, then interests, deduped. */
export function feedSpecialties(p: { specialty: string | null; interests?: string | null }): string[] {
  return [...new Set([p.specialty ?? '', ...parseInterests(p.interests)].filter(Boolean))]
}
```

Append to `src/lib/profile.test.ts`:

```ts
describe('interests helpers', () => {
  it('parses comma-separated interests', () => {
    expect(parseInterests(' 성형외과, 피부과 ,성형외과')).toEqual(['성형외과', '피부과'])
    expect(parseInterests(null)).toEqual([])
  })
  it('builds the feed list primary-first without duplicates', () => {
    expect(feedSpecialties({ specialty: '성형외과', interests: '피부과,성형외과' })).toEqual(['성형외과', '피부과'])
    expect(feedSpecialties({ specialty: null, interests: '피부과' })).toEqual(['피부과'])
  })
})
```

(import the two helpers in that test file.)

- [ ] **Step 3: sources.ts** — `JournalSource` gains `jif?: number` (참고용 config, 2023 JCR 근사치 — 공식 실시간 IF는 유료라 config로 유지한다는 주석 필수) **and `homepage?: string; indexed?: boolean`** (indexed=false → 국제DB 미색인 학회지: 검색 필터로 쓰지 않고 UI에서 바로가기 링크 칩으로 노출한다는 주석 필수). Set on 성형외과 entries: prs 3.9, aps 1.4, jpras 2.2, apls 2.0, asj 3.0, jrm 2.2 (acfs omit). Also append to the 성형외과 list (대한성형외과학회 plasticsurgery.or.kr 계열):

```ts
    { id: 'aaps', label: 'Arch Aesthetic Plast Surg (대한미용성형외과학회지)', ta: 'Arch Aesthet Plast Surg', oa: true, publisher: 'KSAPS', homepage: 'https://www.e-aaps.org', indexed: false },
    { id: 'jwmr', label: 'J Wound Manag Res (대한창상학회지)', ta: 'J Wound Manag Res', oa: true, publisher: 'KWMS', homepage: 'https://www.jwmr.org', indexed: false },
```

and give `aps` a `homepage: 'https://www.e-aps.org'` + `acfs` a `homepage: 'https://www.e-acfs.org'`. Add registry:

```ts
  피부과: [
    { id: 'jaad', label: 'J Am Acad Dermatol (JAAD)', ta: 'J Am Acad Dermatol', oa: false, publisher: 'Elsevier', jif: 12.8 },
    { id: 'bjd', label: 'Br J Dermatol', ta: 'Br J Dermatol', oa: false, publisher: 'OUP', jif: 11.1 },
    { id: 'jamad', label: 'JAMA Dermatology', ta: 'JAMA Dermatol', oa: false, publisher: 'AMA', jif: 11.5 },
    { id: 'jeadv', label: 'JEADV', ta: 'J Eur Acad Dermatol Venereol', oa: false, publisher: 'Wiley', jif: 8.9 },
    { id: 'jid', label: 'J Invest Dermatol', ta: 'J Invest Dermatol', oa: false, publisher: 'Elsevier', jif: 5.7 },
    { id: 'annd', label: 'Ann Dermatol (대한피부과학회)', ta: 'Ann Dermatol', oa: true, publisher: 'KDA', jif: 1.1 },
  ],
```

Add lookup:

```ts
/** Config JIF for a journal title (참고용); undefined when unknown. */
export function jifForJournal(journalTitle: string | null | undefined): number | undefined {
  if (!journalTitle) return undefined
  const t = journalTitle.toLowerCase()
  for (const list of Object.values(SPECIALTY_JOURNALS)) {
    const hit = list.find((j) => j.ta.toLowerCase() === t || j.label.toLowerCase().includes(t) || t.includes(j.ta.toLowerCase()))
    if (hit?.jif != null) return hit.jif
  }
  return undefined
}
```

Append tests: `journalsFor('피부과')` length ≥ 5 incl OA annd; `jifForJournal('Plast Reconstr Surg')` = 3.9; unknown → undefined; `journalsFor('성형외과')` includes `aaps` with `indexed === false` and a homepage.

- [ ] **Step 4:** run the three test files → PASS. Commit `feat(papers): interests column, dermatology registry and config JIF`.

---

### Task 2: Europe PMC source + shared body parser + sort util

**Files:** create `src/lib/europepmc.ts`, `src/lib/europepmc.test.ts`, `src/lib/sortPapers.ts`, `src/lib/sortPapers.test.ts`; modify `src/lib/pubmed.ts` (export extractBodyText)

- [ ] **Step 1: pubmed.ts refactor** — extract the body-joining logic of `fetchPmcFullText` into an exported pure fn and reuse it:

```ts
/** Join <body> section titles/paragraphs of a JATS XML into prompt-ready text. */
export function extractBodyText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const body = doc.querySelector('body')
  if (!body) return ''
  const parts: string[] = []
  body.querySelectorAll('title, p').forEach((n) => {
    const t = n.textContent?.trim()
    if (t) parts.push(t)
  })
  return parts.join('\n\n').slice(0, 60_000)
}
```

(`fetchPmcFullText` body becomes `return extractBodyText(await res.text())`. Existing tests keep passing.)

- [ ] **Step 2: Failing tests `src/lib/europepmc.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { epmcQueryFor, searchEuropePmc, fetchEpmcFullText } from './europepmc'

const HIT = {
  id: '41234567', source: 'MED', pmid: '41234567', pmcid: 'PMC9999999',
  title: 'DIEP flap outcomes', authorString: 'Kim J, Lee S.',
  journalInfo: { journal: { title: 'Arch Plast Surg' } }, pubYear: '2026',
  citedByCount: 42, abstractText: 'Background...', doi: '10.1/abc',
}
const PPR = {
  id: 'PPR123', source: 'PPR', title: 'Preprint on rhinoplasty', authorString: 'Park H.',
  journalInfo: {}, pubYear: '2026', citedByCount: 0, abstractText: 'Pre...',
}

describe('epmcQueryFor', () => {
  it('builds specialty and journal-scoped queries with a date window', () => {
    const q1 = epmcQueryFor('성형외과', [], 7)
    expect(q1).toContain('plastic')
    expect(q1).toContain('FIRST_PDATE:[')
    const q2 = epmcQueryFor('성형외과', ['Arch Plast Surg'], undefined)
    expect(q2).toContain('JOURNAL:"Arch Plast Surg"')
    expect(q2).not.toContain('FIRST_PDATE')
  })
})

describe('searchEuropePmc', () => {
  it('maps hits into Papers (pmid fallback to id, epmc url when no doi)', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ resultList: { result: [HIT, PPR] } }) })
    const papers = await searchEuropePmc('성형외과', fetcher as any, { sort: 'cited', pageSize: 10 })
    expect(fetcher.mock.calls[0][0]).toContain('europepmc.org')
    expect(fetcher.mock.calls[0][0]).toContain('sort%3ACITED') // encoded "sort:CITED" NOT expected — see impl; assert raw param instead
    expect(papers[0]).toMatchObject({
      pmid: '41234567', pmcid: 'PMC9999999', journal: 'Arch Plast Surg',
      citedByCount: 42, authors: 'Kim J, Lee S.', url: 'https://doi.org/10.1/abc',
    })
    expect(papers[1].pmid).toBe('PPR123')
    expect(papers[1].url).toContain('europepmc.org/article/PPR/PPR123')
    expect(papers[1].src).toBe('PPR')
  })
  it('returns [] on empty results and throws on http error', async () => {
    const ok = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
    expect(await searchEuropePmc('성형외과', ok as any, {})).toEqual([])
    const bad = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(searchEuropePmc('성형외과', bad as any, {})).rejects.toThrow()
  })
})

describe('fetchEpmcFullText', () => {
  it('fetches PMC fullTextXML and extracts the body', async () => {
    const xml = '<article><body><sec><title>Methods</title><p>42 flaps.</p></sec></body></article>'
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(xml) })
    const text = await fetchEpmcFullText('PMC9999999', fetcher as any)
    expect(text).toContain('42 flaps.')
    expect(fetcher.mock.calls[0][0]).toContain('PMC9999999/fullTextXML')
  })
  it('returns empty string on failure (fallback handled by caller)', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
    expect(await fetchEpmcFullText('PMC1', fetcher as any)).toBe('')
  })
})
```

NOTE on the sort-assert line: implement the sort as a URL query param `sort=CITED desc` (space encoded `%20`); assert `expect(fetcher.mock.calls[0][0]).toContain('sort=CITED')` instead of the commented line. Write the test with that simpler assertion.

- [ ] **Step 3: Implement `src/lib/europepmc.ts`**

```ts
import { pubmedQueryFor, extractBodyText, type Paper } from './pubmed'

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest'

export interface EpmcOptions {
  pageSize?: number
  days?: number
  tas?: string[]                    // journal filters
  sort?: 'date' | 'cited'           // server-side sort
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/** Europe PMC query: journal-scoped when tas given, else specialty terms; optional date window. */
export function epmcQueryFor(
  specialty: string | null | undefined,
  tas: string[],
  days: number | undefined,
): string {
  const base = tas.length > 0
    ? `(${tas.map((t) => `JOURNAL:"${t}"`).join(' OR ')})`
    : `(${pubmedQueryFor(specialty)})`
  const date = days ? ` AND FIRST_PDATE:[${isoDaysAgo(days)} TO ${new Date().toISOString().slice(0, 10)}]` : ''
  return `${base}${date}`
}

/** Search Europe PMC (covers PubMed/MED, PMC, preprints/PPR …) into Paper[]. */
export async function searchEuropePmc(
  specialty: string | null | undefined,
  fetcher: typeof fetch = fetch,
  opts: EpmcOptions = {},
): Promise<Paper[]> {
  const { pageSize = 12, days, tas = [], sort = 'date' } = opts
  const query = epmcQueryFor(specialty, tas, days)
  const sortParam = sort === 'cited' ? 'CITED desc' : 'P_PDATE_D desc'
  const url =
    `${EPMC}/search?query=${encodeURIComponent(query)}&format=json&resultType=core` +
    `&pageSize=${pageSize}&sort=${encodeURIComponent(sortParam)}`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`europepmc search failed: ${(res as Response).status}`)
  const data = await res.json()
  const hits: any[] = data.resultList?.result ?? []
  return hits.map((h) => ({
    pmid: h.pmid ?? h.id ?? '',
    pmcid: h.pmcid ?? null,
    title: h.title ?? '(제목 없음)',
    journal: h.journalInfo?.journal?.title ?? (h.source === 'PPR' ? '프리프린트' : ''),
    year: String(h.pubYear ?? ''),
    abstract: h.abstractText ?? '',
    url: h.doi ? `https://doi.org/${h.doi}` : `https://europepmc.org/article/${h.source}/${h.id}`,
    authors: h.authorString ?? '',
    citedByCount: h.citedByCount ?? 0,
    src: h.source ?? 'MED',
  }))
}

/** OA full text via Europe PMC; '' when unavailable (caller falls back). */
export async function fetchEpmcFullText(pmcid: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(`${EPMC}/${encodeURIComponent(pmcid)}/fullTextXML`)
  if (!res.ok) return ''
  return extractBodyText(await res.text())
}
```

And in `src/lib/pubmed.ts`, extend `Paper` with the optional fields:

```ts
  authors?: string
  citedByCount?: number
  src?: string          // MED | PMC | PPR …
```

- [ ] **Step 4: Sort util.** `src/lib/sortPapers.test.ts`:

```ts
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
  it('sorts by config JIF with unknown journals last regardless of direction', () => {
    expect(sortPapers(papers, 'jif', 'desc').map((x) => x.pmid)).toEqual(['c', 'a', 'b']) // 12.8 > 3.9 > unknown
    expect(sortPapers(papers, 'jif', 'asc').map((x) => x.pmid)).toEqual(['a', 'c', 'b'])  // 3.9 < 12.8, unknown last
  })
  it('does not mutate the input', () => {
    const before = papers.map((x) => x.pmid)
    sortPapers(papers, 'date', 'desc')
    expect(papers.map((x) => x.pmid)).toEqual(before)
  })
})
```

`src/lib/sortPapers.ts`:

```ts
import type { Paper } from './pubmed'
import { jifForJournal } from './sources'

export type PaperSortKey = 'date' | 'cited' | 'jif'
export type SortDir = 'asc' | 'desc'

export const SORT_LABEL: Record<PaperSortKey, string> = {
  date: '최신순',
  cited: '피인용순',
  jif: 'IF순 (참고)',
}

/** Pure sort; unknown-JIF journals always sink to the end for the jif key. */
export function sortPapers(papers: Paper[], key: PaperSortKey, dir: SortDir): Paper[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...papers].sort((a, b) => {
    if (key === 'jif') {
      const ja = jifForJournal(a.journal)
      const jb = jifForJournal(b.journal)
      if (ja == null && jb == null) return 0
      if (ja == null) return 1
      if (jb == null) return -1
      return sign * (ja - jb)
    }
    if (key === 'cited') return sign * ((a.citedByCount ?? 0) - (b.citedByCount ?? 0))
    return sign * (Number(a.year || 0) - Number(b.year || 0))
  })
}
```

- [ ] **Step 5:** all new tests PASS, full suite green, tsc clean. Commit `feat(papers): Europe PMC source, shared body parser, sortable papers`.

---

### Task 3: Settings modal + Hero/App hookup

**Files:** create `src/components/SettingsModal.tsx`, `src/components/SettingsModal.test.tsx`; modify `src/components/Hero.tsx`, `src/components/Hero.test.tsx`, `src/App.tsx`

- [ ] **Step 1: Failing test `src/components/SettingsModal.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsModal } from './SettingsModal'
import type { Profile } from '../lib/profile'

const profile: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '성형외과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 0, mascot_level: 1, mascot_stage: 1, interests: '피부과',
}

describe('SettingsModal', () => {
  it('shows current specialty and interests, saves changes', async () => {
    const onSave = vi.fn()
    render(<SettingsModal profile={profile} onSave={onSave} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect((within(dialog).getByLabelText('전공') as HTMLSelectElement).value).toBe('성형외과')
    expect(within(dialog).getByRole('checkbox', { name: '피부과' })).toBeChecked()
    await userEvent.selectOptions(within(dialog).getByLabelText('전공'), '피부과')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: '내과' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    expect(onSave).toHaveBeenCalledWith({ specialty: '피부과', interests: '피부과,내과' })
  })
  it('closes without saving', async () => {
    const onClose = vi.fn(); const onSave = vi.fn()
    render(<SettingsModal profile={profile} onSave={onSave} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement `SettingsModal.tsx`** — `role="dialog"` overlay (same pattern as the papers drawer), liquid-glass card `설정`: 전공 select (SPECIALTIES + 기타, aria-label 전공, initial from profile), 관심 전공 checkbox grid (SPECIALTIES, aria-label per name, initial from `parseInterests(profile.interests)`), 저장 button → `onSave({ specialty, interests: checked.join(',') })`, 닫기 button (aria-label 닫기). Note: interests order = selection state order from `parseInterests` initial + toggles appended (the test expects '피부과,내과' — maintain array order: initial interests first, new checks appended, unchecked removed).

- [ ] **Step 3: Hero** — add optional prop `onOpenSettings?: () => void`; the 설정 NAV item renders as a `<button>` (font styles identical) calling it; other items stay anchors. Hero.test: add

```tsx
  it('opens settings from the nav', async () => {
    const onOpenSettings = vi.fn()
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} onOpenSettings={onOpenSettings} now={new Date('2028-02-18')} />)
    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(onOpenSettings).toHaveBeenCalled()
  })
```

(Nav array: give 설정 `{ label: '설정', href: '#', active: true, settings: true }` and branch in render.)

- [ ] **Step 4: App.tsx** — `const [settingsOpen, setSettingsOpen] = useState(false)`; pass `onOpenSettings={() => setSettingsOpen(true)}` to Hero; render below HomeSections:

```tsx
      {settingsOpen && (
        <SettingsModal
          profile={profile!}
          onClose={() => setSettingsOpen(false)}
          onSave={async (v) => {
            try {
              const saved = await upsertProfile(supabase, { id: profile!.id, ...v })
              setProfile(saved)
              setSettingsOpen(false)
            } catch (e) { console.error(e) }
          }}
        />
      )}
```

App.test unaffected (modal only renders when opened; new imports fine).

- [ ] **Step 5:** tests PASS, tsc clean. Commit `feat(settings): specialty + interests settings modal from hero nav`.

---

### Task 4: Shelf UI — PaperShelf/PaperCover + PapersSection v3

**Files:** create `src/components/sections/PaperShelf.tsx`, `src/components/sections/PaperShelf.test.tsx`; modify `src/components/sections/PapersSection.tsx`, `src/components/sections/PapersSection.test.tsx`, `src/index.css`

- [ ] **Step 1: index.css** — append:

```css
.shelf-scroll {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 8px;
  scrollbar-width: thin;
}
.shelf-scroll > * { scroll-snap-align: start; flex-shrink: 0; }
```

- [ ] **Step 2: Failing test `PaperShelf.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaperShelf } from './PaperShelf'
import type { Paper } from '../../lib/pubmed'

const papers: Paper[] = [
  { pmid: '1', pmcid: 'PMC1', title: 'DIEP flap outcomes in Asian patients', journal: 'Arch Plast Surg', year: '2026', abstract: 'A', url: 'https://x', authors: 'Kim J, Lee S', citedByCount: 42, src: 'MED' },
  { pmid: '2', pmcid: null, title: 'Rhinoplasty preprint', journal: '프리프린트', year: '2026', abstract: '', url: 'https://y', authors: 'Park H', citedByCount: 0, src: 'PPR' },
]

describe('PaperShelf', () => {
  it('renders the shelf title and cover cards with metadata', () => {
    render(<PaperShelf title="성형외과 신착" papers={papers} onOpen={vi.fn()} />)
    expect(screen.getByText('성형외과 신착')).toBeInTheDocument()
    const card = screen.getByText(/DIEP flap/).closest('article')!
    expect(within(card).getByText(/Arch Plast Surg/)).toBeInTheDocument()
    expect(within(card).getByText(/피인용 42/)).toBeInTheDocument()
    expect(within(card).getByText('원문')).toBeInTheDocument()   // pmcid badge
    expect(screen.getByText(/프리프린트/)).toBeInTheDocument()
  })
  it('opens a paper on click', async () => {
    const onOpen = vi.fn()
    render(<PaperShelf title="t" papers={papers} onOpen={onOpen} />)
    await userEvent.click(screen.getByText(/DIEP flap/))
    expect(onOpen).toHaveBeenCalledWith(papers[0])
  })
  it('shows an empty note when there are no papers', () => {
    render(<PaperShelf title="t" papers={[]} onOpen={vi.fn()} emptyNote="논문이 없습니다" />)
    expect(screen.getByText('논문이 없습니다')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Implement `PaperShelf.tsx`** — cover color from a journal-name hash:

```tsx
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
              <p className="mt-2 line-clamp-1 font-mono text-[11px] text-cream/70">{p.authors || ' '}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: PapersSection v3** — replace the card grid with shelves. Props change: `papers: Paper[]` → `shelves: { label: string; papers: Paper[] }[]`; add `sortKey: PaperSortKey`, `sortDir: SortDir`, `onSortKeyChange`, `onSortDirChange`. Controls row gains:

```tsx
          <select aria-label="정렬" value={sortKey} onChange={(e) => onSortKeyChange(e.target.value as PaperSortKey)}
            className="rounded-md bg-white/5 px-3 py-2 font-mono text-xs text-cream outline-none [&>option]:bg-bg">
            {Object.entries(SORT_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button aria-label="정렬 방향" onClick={() => onSortDirChange(sortDir === 'desc' ? 'asc' : 'desc')}
            className="rounded-md border border-white/30 px-3 py-2 font-mono text-xs text-cream transition hover:bg-white/10">
            {sortDir === 'desc' ? '↓ 내림차순' : '↑ 오름차순'}
          </button>
```

Render `shelves.map((s) => <PaperShelf key={s.label} title={s.label} papers={s.papers} onOpen={onOpen} />)`; 내 레포트 stays but restyle as a shelf-like horizontal list is optional — keep the existing list (YAGNI). PDF upload card and drawer unchanged.

**Journal chips split by `indexed`:** chips for `indexed !== false` journals filter as before; journals with `indexed === false` render as LINK chips instead — `<a href={j.homepage} target="_blank" rel="noreferrer">` styled like a chip with a `↗` suffix and title hint `국제 DB 미색인 — 학회지 사이트로 이동` (no filter behavior, honest about not being searchable). Add a test: AAPS renders as a link with the homepage href, not a button. Update `PapersSection.test.tsx`: fixtures move into `shelves=[{label:'성형외과 신착', papers}]`; keep drawer/upload/report tests; add a sort-controls test asserting both callbacks fire; drop the old grid-specific OA badge test (badge now covered by PaperShelf tests).

- [ ] **Step 5:** tests PASS. Commit `feat(sections): bookshelf paper UI with sort controls`.

---

### Task 5: HomeSections wiring v3 + full gate

**Files:** modify `src/home/HomeSections.tsx`

- [ ] **Step 1:** Imports: `searchEuropePmc, fetchEpmcFullText` from `../lib/europepmc`; `sortPapers, type PaperSortKey, type SortDir` from `../lib/sortPapers`; `feedSpecialties` from `../lib/profile`; drop `fetchRecentPapers` import (keep `fetchPmcFullText` as fulltext fallback).

State: replace `papers` with `shelfData: { label: string; papers: Paper[] }[]`; add `sortKey` (`'date'`), `sortDir` (`'desc'`).

- [ ] **Step 2:** Refresh handler fetches one shelf per feed specialty (journal chips apply to the PRIMARY specialty shelf only; server-sort by date/cited, jif sorts client-side):

```tsx
  const handleRefreshPapers = async () => {
    setPapersLoading(true)
    setPapersError(null)
    try {
      const specialties = feedSpecialties(profile)
      const tas = journals.filter((j) => selectedJournals.includes(j.id)).map((j) => j.ta)
      const serverSort = sortKey === 'cited' ? 'cited' : 'date'
      const results = await Promise.all(
        specialties.map((s, i) =>
          searchEuropePmc(s, fetch, {
            days: paperDays,
            tas: i === 0 ? tas : [],
            pageSize: 10,
            sort: serverSort as 'date' | 'cited',
          }).catch(() => [] as Paper[]),
        ),
      )
      setShelfData(specialties.map((s, i) => ({ label: `${s} 신착`, papers: results[i] })))
    } catch (e) {
      console.error(e)
      setPapersError('논문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setPapersLoading(false)
    }
  }
```

Derived shelves passed to the section apply the client sort:

```tsx
  const shelves = shelfData.map((s) => ({ label: s.label, papers: sortPapers(s.papers, sortKey, sortDir) }))
```

- [ ] **Step 2b:** journal chips filter uses only indexed journals: `const tas = journals.filter((j) => j.indexed !== false && selectedJournals.includes(j.id)).map((j) => j.ta)`.

- [ ] **Step 3:** `handleOpenPaper` fulltext path: try Europe PMC first, fall back to NCBI:

```tsx
      if (p.pmcid) {
        const body = (await fetchEpmcFullText(p.pmcid)) || (await fetchPmcFullText(p.pmcid).catch(() => ''))
        ...
      }
```

(rest of the handler unchanged). Pass new props (`shelves`, `sortKey`, `sortDir`, handlers) into `<PapersSection>`; `journals` chips still come from the primary specialty.

- [ ] **Step 4: Full gate** — `npm test` green, tsc clean, build OK, dev boots. Commit `feat(home): multi-specialty europepmc shelves with sorting`.

---

## Self-Review (completed by author)

**Coverage:** 밀리 스타일(선반/커버/가로 스크롤) → T4; PubMed 외 소스(Europe PMC: MED+PMC+프리프린트) → T2/T5; 정렬(최신/피인용/IF±) → T2(sortPapers)/T4(controls)/T5(server cited sort); 전공 설정(성형외과·피부과, 관심전공 다중) → T1(interests)/T3(SettingsModal)/T5(feedSpecialties shelves); 피부과 저널+JIF config → T1. ✓
**Honesty:** IF는 config(공개 JCR 근사, '참고' 라벨), 조회수는 공개 API 부재로 피인용수 대체 — SORT_LABEL에 'IF순 (참고)' 명시. ✓
**Type consistency:** `Paper` optional 확장(T2) ← PaperShelf/T4·T5 사용; `PaperSortKey/SortDir`(T2)=T4 props=T5 state; `feedSpecialties`(T1)=T5; SettingsModal onSave shape = App upsert(T3); `epmcQueryFor` reuses `pubmedQueryFor`(alias-aware). fetchRecentPapers는 미사용화되지만 모듈/테스트 유지(다른 소비자 없음 확인). ✓
