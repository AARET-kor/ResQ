# ResQ Papers v2 Implementation Plan (풀텍스트 리포트, 성형외과 파일럿)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade papers from abstract summaries to full-paper bilingual (KO+EN) structured reports — journal-scoped + date-windowed PubMed search, PMC open-access full-text extraction, PDF upload analysis, and a saved-reports library. Plastic surgery (성형외과) pilot.

**Architecture:** A per-specialty journal registry (`sources.ts`) drives journal-filtered PubMed queries (`[ta]` terms + `reldate`). `parsePubmedArticles` now also extracts the PMCID; `fetchPmcFullText` pulls open-access body text from PMC. The `analyze-paper` edge function gains a `report` mode accepting `fulltext` text or a base64 `pdf` (Claude document block) and returns a bilingual structured report. `paper_analyses` gains `kind/has_fulltext/source` and doubles as the report library. UI: period + journal-chip controls, OA badges, report drawer with .md download, PDF upload, saved-reports list.

**Tech Stack:** unchanged. No new client deps (PDF read happens server-side via Claude's native PDF support).

**Branch:** `feat/home-sections`.

---

## File Structure

```
supabase/migrations/0006_paper_reports.sql
supabase/functions/analyze-paper/index.ts   # v2: report mode (fulltext | pdf)
src/lib/sources.ts (+test)                  # specialty → journal registry
src/lib/pubmed.ts (+test upd)              # pmcid, [ta] filter, reldate, fetchPmcFullText
src/lib/papers.ts (+test upd)              # requestReport, saveAnalysis v2, listMyReports
src/mascot/roster.ts (+test upd)           # 성형외과 → 공작(peacock)
src/lib/pubmed.ts SPECIALTY_QUERY          # + 성형외과
src/components/sections/PapersSection.tsx (+test upd)
src/home/HomeSections.tsx                   # wiring v2
```

---

### Task 1: Roster + query + journal registry + migration

**Files:**
- Modify: `src/mascot/roster.ts`, `src/mascot/roster.test.ts`, `src/lib/pubmed.ts` (query map only), `src/lib/pubmed.test.ts`
- Create: `src/lib/sources.ts`, `src/lib/sources.test.ts`, `supabase/migrations/0006_paper_reports.sql`

- [ ] **Step 1: roster — add peacock + 성형외과.** In `ANIMALS` (before alpaca) add:

```ts
  { id: 'peacock', label: '공작', glyph: '🦚', tint: '#22d3ee' },
```

In `SPECIALTY_ANIMALS` add `성형외과: 'peacock',` (after 외과).
Append to `roster.test.ts` mapping test: `expect(animalForSpecialty('성형외과').id).toBe('peacock')`.

- [ ] **Step 2: pubmed query map** — in `SPECIALTY_QUERY` add `성형외과: 'plastic reconstructive surgery',` and in `pubmed.test.ts` first test add `expect(pubmedQueryFor('성형외과')).toContain('plastic')`.

- [ ] **Step 3: Write failing test `src/lib/sources.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { journalsFor, journalById } from './sources'

describe('journal sources', () => {
  it('lists plastic-surgery journals including Thieme OA APS', () => {
    const js = journalsFor('성형외과')
    expect(js.length).toBeGreaterThanOrEqual(5)
    const aps = js.find((j) => j.id === 'aps')!
    expect(aps.oa).toBe(true)
    expect(aps.publisher).toBe('Thieme')
    expect(aps.ta).toBe('Arch Plast Surg')
  })
  it('resolves aliases and unknown specialties', () => {
    expect(journalsFor('마취과')).toEqual([]) // no registry yet → empty
    expect(journalsFor(null)).toEqual([])
  })
  it('looks a journal up by id within a specialty', () => {
    expect(journalById('성형외과', 'prs')?.ta).toBe('Plast Reconstr Surg')
    expect(journalById('성형외과', 'nope')).toBeUndefined()
  })
})
```

- [ ] **Step 4: Create `src/lib/sources.ts`**

```ts
import { canonicalSpecialty } from '../mascot/roster'

export interface JournalSource {
  id: string
  label: string
  ta: string        // PubMed journal title abbreviation ([ta] filter)
  oa: boolean       // open access → PMC full text expected
  publisher: string
}

/**
 * 전공별 학회지/저널 레지스트리 (config). 성형외과 파일럿.
 * 유료지는 PubMed 메타데이터+초록까지만 — 본문 스크래핑은 하지 않는다.
 * Thieme 커버: Archives of Plastic Surgery(대한성형외과학회지, OA), J Reconstr Microsurg.
 */
export const SPECIALTY_JOURNALS: Record<string, JournalSource[]> = {
  성형외과: [
    { id: 'prs', label: 'Plast Reconstr Surg (PRS)', ta: 'Plast Reconstr Surg', oa: false, publisher: 'LWW' },
    { id: 'aps', label: 'Archives of Plastic Surgery (대한성형외과학회지)', ta: 'Arch Plast Surg', oa: true, publisher: 'Thieme' },
    { id: 'jpras', label: 'JPRAS', ta: 'J Plast Reconstr Aesthet Surg', oa: false, publisher: 'Elsevier' },
    { id: 'apls', label: 'Aesthetic Plastic Surgery', ta: 'Aesthetic Plast Surg', oa: false, publisher: 'Springer' },
    { id: 'asj', label: 'Aesthetic Surgery Journal', ta: 'Aesthet Surg J', oa: false, publisher: 'OUP' },
    { id: 'acfs', label: 'Arch Craniofac Surg', ta: 'Arch Craniofac Surg', oa: true, publisher: '대한두개안면성형외과학회' },
    { id: 'jrm', label: 'J Reconstr Microsurg', ta: 'J Reconstr Microsurg', oa: false, publisher: 'Thieme' },
  ],
}

export function journalsFor(specialty: string | null | undefined): JournalSource[] {
  return SPECIALTY_JOURNALS[canonicalSpecialty(specialty)] ?? []
}

export function journalById(specialty: string | null | undefined, id: string): JournalSource | undefined {
  return journalsFor(specialty).find((j) => j.id === id)
}
```

- [ ] **Step 5: Migration `supabase/migrations/0006_paper_reports.sql`**

```sql
-- Papers v2: analyses become a report library. Re-runnable.
alter table public.paper_analyses
  add column if not exists kind text not null default 'abstract',      -- abstract | report
  add column if not exists has_fulltext boolean not null default false,
  add column if not exists source text;                                 -- journal label | 'pdf'
```

- [ ] **Step 6:** Run `npm test -- src/lib/sources.test.ts src/mascot/roster.test.ts src/lib/pubmed.test.ts` → PASS. Commit:

```bash
git add -A
git commit -m "feat(papers): plastic-surgery journal registry, peacock mascot, report columns"
```

---

### Task 2: PubMed v2 — pmcid + journal/date filters + PMC full text

**Files:**
- Modify: `src/lib/pubmed.ts`, `src/lib/pubmed.test.ts`

- [ ] **Step 1: Extend the XML fixture in `pubmed.test.ts`.** In the FIRST `<PubmedArticle>` (PMID 111), after `</MedlineCitation>` insert:

```xml
    <PubmedData><ArticleIdList>
      <ArticleId IdType="pubmed">111</ArticleId>
      <ArticleId IdType="pmc">PMC7654321</ArticleId>
    </ArticleIdList></PubmedData>
```

Add a PMC body fixture and new tests:

```ts
const PMC_XML = `<?xml version="1.0"?>
<pmc-articleset><article><body>
  <sec><title>Introduction</title><p>Flap survival matters.</p></sec>
  <sec><title>Methods</title><p>We reviewed 42 cases.</p><p>Statistics were used.</p></sec>
</body></article></pmc-articleset>`
```

```ts
describe('pmcid + filters', () => {
  it('extracts the pmcid when present', () => {
    const papers = parsePubmedArticles(XML)
    expect(papers[0].pmcid).toBe('PMC7654321')
    expect(papers[1].pmcid).toBeNull()
  })
  it('builds journal-scoped terms and date windows', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ esearchresult: { idlist: [] } }) })
    await fetchRecentPapers('성형외과', fetcher as any, { tas: ['Arch Plast Surg', 'Plast Reconstr Surg'], days: 7 })
    const url = fetcher.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent('"Arch Plast Surg"[ta]'))
    expect(url).toContain(encodeURIComponent(' OR '))
    expect(url).toContain('reldate=7')
    expect(url).toContain('datetype=pdat')
  })
})

describe('fetchPmcFullText', () => {
  it('joins section titles and paragraphs', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(PMC_XML) })
    const text = await fetchPmcFullText('PMC7654321', fetcher as any)
    expect(text).toContain('Introduction')
    expect(text).toContain('We reviewed 42 cases.')
    expect(fetcher.mock.calls[0][0]).toContain('db=pmc')
    expect(fetcher.mock.calls[0][0]).toContain('PMC7654321')
  })
  it('returns empty string when there is no body', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('<pmc-articleset/>') })
    expect(await fetchPmcFullText('PMC1', fetcher as any)).toBe('')
  })
})
```

Also update the existing `fetchRecentPapers` import line to include `fetchPmcFullText`.

- [ ] **Step 2: Run to verify FAIL**, then update `src/lib/pubmed.ts`:

(a) `Paper` gains `pmcid: string | null`.
(b) In `parsePubmedArticles`, extract pmcid:

```ts
    const pmcid =
      Array.from(a.querySelectorAll('ArticleId'))
        .find((n) => n.getAttribute('IdType') === 'pmc')
        ?.textContent?.trim() ?? null
```

and include `pmcid` in the returned object.
(c) Replace `fetchRecentPapers`'s signature/term building:

```ts
export interface FetchOptions {
  retmax?: number
  days?: number          // reldate window (e.g. 7 or 30)
  tas?: string[]         // journal [ta] filters; overrides the specialty term
}

export async function fetchRecentPapers(
  specialty: string | null | undefined,
  fetcher: typeof fetch = fetch,
  opts: FetchOptions = {},
): Promise<Paper[]> {
  const { retmax = 9, days, tas } = opts
  const term = tas && tas.length > 0
    ? `(${tas.map((t) => `"${t}"[ta]`).join(' OR ')})`
    : pubmedQueryFor(specialty)
  let searchUrl =
    `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=pub_date&retmax=${retmax}` +
    `&term=${encodeURIComponent(term)}`
  if (days) searchUrl += `&reldate=${days}&datetype=pdat`
  const sRes = await fetcher(searchUrl)
  if (!sRes.ok) throw new Error(`pubmed esearch failed: ${(sRes as Response).status}`)
  const sJson = await sRes.json()
  const ids: string[] = sJson.esearchresult?.idlist ?? []
  if (ids.length === 0) return []
  const fetchUrl = `${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id=${encodeURIComponent(ids.join(','))}`
  const fRes = await fetcher(fetchUrl)
  if (!fRes.ok) throw new Error(`pubmed efetch failed: ${(fRes as Response).status}`)
  return parsePubmedArticles(await fRes.text())
}
```

(d) Add PMC full-text fetch:

```ts
/** Open-access full text from PMC (empty string when no body is available). */
export async function fetchPmcFullText(pmcid: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(`${EUTILS}/efetch.fcgi?db=pmc&retmode=xml&id=${encodeURIComponent(pmcid)}`)
  if (!res.ok) throw new Error(`pmc efetch failed: ${(res as Response).status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/xml')
  const body = doc.querySelector('body')
  if (!body) return ''
  const parts: string[] = []
  body.querySelectorAll('title, p').forEach((n) => {
    const t = n.textContent?.trim()
    if (t) parts.push(t)
  })
  // Cap for prompt budget; reports don't need references/appendices tails.
  return parts.join('\n\n').slice(0, 60_000)
}
```

- [ ] **Step 3:** `npm test -- src/lib/pubmed.test.ts` → PASS. Full `npm test` → the old third-positional-arg is gone; confirm nothing else called it (only HomeSections uses `fetchRecentPapers(profile.specialty)` — still valid). Commit:

```bash
git add -A
git commit -m "feat(pubmed): pmcid extraction, journal/date filters, PMC full text"
```

---

### Task 3: Edge function v2 + papers data access v2

**Files:**
- Modify: `supabase/functions/analyze-paper/index.ts`, `src/lib/papers.ts`, `src/lib/papers.test.ts`

- [ ] **Step 1: Rewrite `supabase/functions/analyze-paper/index.ts`** (backward compatible: no `mode` → abstract behavior)

```ts
// Supabase Edge Function: analyze-paper (v2 — abstract | report modes)
// Deploy: supabase functions deploy analyze-paper
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REPORT_FORMAT = `형식(각 섹션마다 한국어 본문을 먼저 쓰고, 바로 아래 "EN:"으로 시작하는 간결한 영어 요약을 병기):
## 요약 (3줄)
## 연구 배경
## 방법
## 핵심 결과 (수치 포함)
## 고찰 및 임상적 의의
## 한계
## 전공의 관점 포인트 (실전에서 기억할 것)`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { title, abstract, fulltext, pdfBase64, specialty, mode } = await req.json()
    if (!title) return Response.json({ error: 'title required' }, { status: 400, headers: CORS })

    const role = `당신은 ${specialty ?? '의학'} 전공의를 돕는 논문 분석 비서입니다.`
    let content: unknown[]
    if (mode === 'report' && pdfBase64) {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: `${role} 첨부된 논문 전체를 정독하고 아래 형식의 리포트를 작성하세요.\n${REPORT_FORMAT}\n\n제목: ${title}` },
      ]
    } else if (mode === 'report' && fulltext) {
      content = [{
        type: 'text',
        text: `${role} 아래 논문 전문을 정독하고 아래 형식의 리포트를 작성하세요.\n${REPORT_FORMAT}\n\n제목: ${title}\n\n본문:\n${fulltext}`,
      }]
    } else {
      if (!abstract) return Response.json({ error: 'abstract required' }, { status: 400, headers: CORS })
      content = [{
        type: 'text',
        text: `${role} 다음 논문 초록을 한국어로 분석해주세요. 형식: ① 세 줄 요약 ② 연구 방법 ③ 핵심 결과 ④ 임상적 의의 ⑤ 한계점. 간결하고 정확하게.\n\n제목: ${title}\n\n초록:\n${abstract}`,
      }]
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: mode === 'report' ? 4000 : 1500,
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return Response.json({ error: `anthropic ${res.status}: ${detail}` }, { status: 502, headers: CORS })
    }
    const data = await res.json()
    const analysis = data.content?.[0]?.text ?? ''
    return Response.json({ analysis }, { headers: CORS })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS })
  }
})
```

- [ ] **Step 2: papers.ts v2 — failing tests first.** In `src/lib/papers.test.ts`: update the `paper` fixture to include `pmcid: null`; add tests:

```ts
describe('papers v2', () => {
  it('requestReport sends report mode with fulltext', async () => {
    const c = fakeClient(null, { data: { analysis: '## 요약' }, error: null })
    const text = await requestReport(c, paper, '성형외과', { fulltext: 'BODY TEXT' })
    expect(text).toBe('## 요약')
    expect(c.calls[0].args.mode).toBe('report')
    expect(c.calls[0].args.fulltext).toBe('BODY TEXT')
  })
  it('requestReport sends pdf payloads', async () => {
    const c = fakeClient(null)
    await requestReport(c, paper, '성형외과', { pdfBase64: 'QUJD' })
    expect(c.calls[0].args.pdfBase64).toBe('QUJD')
  })
  it('saveAnalysis persists kind, fulltext flag and source', async () => {
    const c = fakeClient(null)
    const row = await saveAnalysis(c, 'u1', paper, '리포트', { kind: 'report', hasFulltext: true, source: 'Arch Plast Surg' })
    expect(c.calls[0].args.kind).toBe('report')
    expect(c.calls[0].args.has_fulltext).toBe(true)
    expect(c.calls[0].args.source).toBe('Arch Plast Surg')
    expect(row.analysis).toBe('리포트')
  })
  it('listMyReports queries the user library', async () => {
    const rows = [{ id: 'pa1', pmid: '111', title: 'T', analysis: 'A', kind: 'report' }]
    const c = fakeClientList(rows as any)
    expect(await listMyReports(c, 'u1')).toHaveLength(1)
  })
})
```

Add alongside `fakeClient` a list-shaped fake:

```ts
function fakeClientList(rows: any[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  } as any
}
```

Update imports to include `requestReport`, `listMyReports`.

- [ ] **Step 3: Implement in `src/lib/papers.ts`** — `PaperAnalysis` gains `kind: string`, `has_fulltext: boolean`, `source: string | null` (all optional-tolerant); add:

```ts
export async function requestReport(
  client: SupabaseClient,
  paper: Paper,
  specialty: string | null,
  input: { fulltext?: string; pdfBase64?: string },
): Promise<string> {
  const { data, error } = await client.functions.invoke('analyze-paper', {
    body: {
      mode: 'report',
      title: paper.title,
      abstract: paper.abstract,
      specialty,
      ...input,
    },
  })
  if (error || !data?.analysis) {
    throw new Error('분석 서버에 연결할 수 없습니다. (analyze-paper 함수 배포 필요)')
  }
  return data.analysis as string
}

export async function listMyReports(client: SupabaseClient, userId: string): Promise<PaperAnalysis[]> {
  const { data, error } = await client
    .from('paper_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as PaperAnalysis[]) ?? []
}
```

and extend `saveAnalysis` with a 5th param `meta: { kind?: 'abstract' | 'report'; hasFulltext?: boolean; source?: string | null } = {}` merged into the upsert row as `kind: meta.kind ?? 'abstract'`, `has_fulltext: meta.hasFulltext ?? false`, `source: meta.source ?? null`.

- [ ] **Step 4:** `npm test -- src/lib/papers.test.ts` → PASS. `npm run build` (edge fn stays out of bundle). Commit:

```bash
git add -A
git commit -m "feat(papers): report mode (fulltext/pdf) edge fn v2 and data access"
```

---

### Task 4: PapersSection v2 UI

**Files:**
- Modify: `src/components/sections/PapersSection.tsx`, `src/components/sections/PapersSection.test.tsx`

New props (full component signature):

```ts
{
  papers: Paper[]
  loading: boolean
  error: string | null
  journals: JournalSource[]                 // registry for the user's specialty ([] hides chips)
  selectedJournals: string[]                // journal ids
  onToggleJournal: (id: string) => void
  days: 7 | 30
  onDaysChange: (d: 7 | 30) => void
  onRefresh: () => void
  onOpen: (p: Paper) => void
  onUploadPdf: (file: File) => void
  reports: PaperAnalysis[]                  // saved library
  onOpenReport: (r: PaperAnalysis) => void
  selected: Paper | null
  selectedTitle: string | null              // drawer title (paper or saved report)
  analysis: string | null
  analysisKind: 'abstract' | 'report' | null
  analysisLoading: boolean
  analysisError: string | null
  onClose: () => void
}
```

- [ ] **Step 1: Rewrite the test** — keep the passing v1 cases (cards render, onRefresh/onOpen, drawer shows analysis via `within(dialog)`, failure notice, empty/loading) adapted to the new props, and add:

```tsx
  it('filters by journal chips and period', async () => {
    const onToggleJournal = vi.fn(); const onDaysChange = vi.fn()
    render(<PapersSection {...base} journals={JOURNALS} selectedJournals={[]}
      onToggleJournal={onToggleJournal} days={7} onDaysChange={onDaysChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Archives of Plastic Surgery/ }))
    expect(onToggleJournal).toHaveBeenCalledWith('aps')
    await userEvent.click(screen.getByRole('button', { name: '최근 30일' }))
    expect(onDaysChange).toHaveBeenCalledWith(30)
  })
  it('marks OA journals and full-text availability', () => {
    render(<PapersSection {...base} journals={JOURNALS}
      papers={[{ ...papers[0], pmcid: 'PMC1' }]} />)
    expect(screen.getByText('원문 분석 가능')).toBeInTheDocument()
  })
  it('fires onUploadPdf with the chosen file', async () => {
    const onUploadPdf = vi.fn()
    render(<PapersSection {...base} onUploadPdf={onUploadPdf} />)
    const file = new File(['%PDF-'], 'paper.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('PDF 업로드'), file)
    expect(onUploadPdf).toHaveBeenCalledWith(file)
  })
  it('lists saved reports and reopens them', async () => {
    const onOpenReport = vi.fn()
    const report = { id: 'pa1', user_id: 'u1', pmid: '111', title: '저장된 리포트', journal: 'APS', year: '2026', abstract: null, analysis: '## 요약', kind: 'report', has_fulltext: true, source: 'APS' }
    render(<PapersSection {...base} reports={[report as any]} onOpenReport={onOpenReport} />)
    await userEvent.click(screen.getByText('저장된 리포트'))
    expect(onOpenReport).toHaveBeenCalled()
  })
  it('offers an .md download link when a report is open', () => {
    render(<PapersSection {...base} selected={papers[0]} selectedTitle={papers[0].title}
      analysis={'## 요약\n내용'} analysisKind="report" />)
    expect(screen.getByRole('link', { name: /리포트 다운로드/ })).toBeInTheDocument()
  })
```

(`base` = a helper object with all props defaulted: empty arrays, vi.fn()s, days 7, nulls. `JOURNALS` imported from `../../lib/sources` via `journalsFor('성형외과')`. Papers fixtures gain `pmcid: null`.)

- [ ] **Step 2: Implement.** Key elements (keep existing v1 structure/styles; additions):
  - Controls row: period buttons `최근 7일` / `최근 30일` (active = bg-neon text-bg), journal chips (only when `journals.length > 0`): each chip is a button labeled with `j.label`, active when included in `selectedJournals`, OA journals get a small `OA` tag inside the chip.
  - Card badge: when `p.pmcid` → `<span>원문 분석 가능</span>` (neon, mono 10px); else if abstract only nothing.
  - PDF upload card at the grid end: `<label>PDF 업로드<input aria-label="PDF 업로드" type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadPdf(e.target.files[0])} /></label>` styled like a dashed liquid-glass card.
  - 내 레포트: below the grid, `reports.map` rows (title · source · kind badge) clickable → `onOpenReport(r)`.
  - Drawer: title from `selectedTitle`; when `analysisKind === 'report'` show badge `풀 리포트` and a download link:

```tsx
{analysis && (
  <a
    download="resq-paper-report.md"
    href={`data:text/markdown;charset=utf-8,${encodeURIComponent(analysis)}`}
    className="font-mono text-[10px] uppercase text-neon underline"
  >
    리포트 다운로드 (.md)
  </a>
)}
```

  - Drawer body renders `analysis` with `whitespace-pre-wrap` (markdown headings shown as text — fine for v2).
  - Keep `role="dialog"`, `within(dialog)` friendliness, 닫기 button.

- [ ] **Step 3:** `npm test -- src/components/sections/PapersSection.test.tsx` → PASS. Commit:

```bash
git add -A
git commit -m "feat(sections): papers v2 UI — filters, badges, pdf upload, report library"
```

---

### Task 5: HomeSections wiring v2 + full gate

**Files:**
- Modify: `src/home/HomeSections.tsx`

- [ ] **Step 1: State additions**

```tsx
  const [paperDays, setPaperDays] = useState<7 | 30>(7)
  const [selectedJournals, setSelectedJournals] = useState<string[]>([])
  const [reports, setReports] = useState<PaperAnalysis[]>([])
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null)
  const [analysisKind, setAnalysisKind] = useState<'abstract' | 'report' | null>(null)
```

Imports: `journalsFor` from `../lib/sources`; `fetchPmcFullText` from `../lib/pubmed`; `requestReport`, `listMyReports`, `type PaperAnalysis` from `../lib/papers`.

Load the library on mount / after saves:

```tsx
  useEffect(() => {
    let active = true
    listMyReports(supabase, userId).then((r) => { if (active) setReports(r) }).catch(console.error)
    return () => { active = false }
  }, [userId])
```

- [ ] **Step 2: Handlers**

```tsx
  const journals = journalsFor(profile.specialty)

  const handleToggleJournal = (id: string) =>
    setSelectedJournals((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const handleRefreshPapers = async () => {
    setPapersLoading(true)
    setPapersError(null)
    try {
      const tas = journals.filter((j) => selectedJournals.includes(j.id)).map((j) => j.ta)
      setPapers(await fetchRecentPapers(profile.specialty, fetch, { days: paperDays, tas, retmax: 12 }))
    } catch (e) {
      console.error(e)
      setPapersError('논문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setPapersLoading(false)
    }
  }

  const refreshReports = () =>
    listMyReports(supabase, userId).then(setReports).catch(console.error)

  const handleOpenPaper = async (p: Paper) => {
    setSelectedPaper(p)
    setSelectedTitle(p.title)
    setAnalysis(null); setAnalysisKind(null); setAnalysisError(null); setAnalysisLoading(true)
    try {
      const cached = await getAnalysis(supabase, userId, p.pmid)
      if (cached) { setAnalysis(cached.analysis); setAnalysisKind((cached.kind as any) ?? 'abstract'); return }
      let text: string
      let kind: 'abstract' | 'report' = 'abstract'
      let hasFulltext = false
      if (p.pmcid) {
        const body = await fetchPmcFullText(p.pmcid).catch(() => '')
        if (body) {
          text = await requestReport(supabase, p, profile.specialty, { fulltext: body })
          kind = 'report'; hasFulltext = true
        } else {
          if (!p.abstract) { setAnalysisError('초록이 없는 논문은 분석할 수 없습니다.'); return }
          text = await requestAnalysis(supabase, p, profile.specialty)
        }
      } else {
        if (!p.abstract) { setAnalysisError('초록이 없는 논문은 분석할 수 없습니다. 원문 링크를 확인해주세요.'); return }
        text = await requestAnalysis(supabase, p, profile.specialty)
      }
      await saveAnalysis(supabase, userId, p, text, { kind, hasFulltext, source: p.journal || null })
      setAnalysis(text); setAnalysisKind(kind)
      const updated = await recordXpEvent(supabase, profile, 'read_paper')
      onProfileChange(updated)
      refreshReports()
    } catch (e) {
      console.error(e)
      setAnalysisError(e instanceof Error ? e.message : '분석에 실패했습니다.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const handleUploadPdf = async (file: File) => {
    const surrogate: Paper = {
      pmid: `pdf-${Date.now()}`, title: file.name.replace(/\.pdf$/i, ''), journal: 'PDF 업로드',
      year: '', abstract: '', url: '', pmcid: null,
    }
    setSelectedPaper(surrogate)
    setSelectedTitle(surrogate.title)
    setAnalysis(null); setAnalysisKind(null); setAnalysisError(null); setAnalysisLoading(true)
    try {
      const buf = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const pdfBase64 = btoa(binary)
      const text = await requestReport(supabase, surrogate, profile.specialty, { pdfBase64 })
      await saveAnalysis(supabase, userId, surrogate, text, { kind: 'report', hasFulltext: true, source: 'pdf' })
      setAnalysis(text); setAnalysisKind('report')
      const updated = await recordXpEvent(supabase, profile, 'read_paper')
      onProfileChange(updated)
      refreshReports()
    } catch (e) {
      console.error(e)
      setAnalysisError(e instanceof Error ? e.message : 'PDF 분석에 실패했습니다.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const handleOpenReport = (r: PaperAnalysis) => {
    setSelectedPaper({ pmid: r.pmid, title: r.title, journal: r.journal ?? '', year: r.year ?? '', abstract: r.abstract ?? '', url: r.pmid.startsWith('pdf-') ? '' : `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, pmcid: null })
    setSelectedTitle(r.title)
    setAnalysis(r.analysis)
    setAnalysisKind(((r as any).kind as any) ?? 'abstract')
    setAnalysisError(null)
  }
```

`handleClosePaper` also resets `selectedTitle`/`analysisKind`.

- [ ] **Step 3: Pass the new props into `<PapersSection>`** (journals, selectedJournals, onToggleJournal, days=paperDays, onDaysChange=setPaperDays, onUploadPdf, reports, onOpenReport, selectedTitle, analysisKind + existing).

- [ ] **Step 4: Full gate** — `npm test` all green, `npx tsc -b --noEmit` clean, `npm run build` succeeds, dev boots (no login). Commit:

```bash
git add -A
git commit -m "feat(home): wire papers v2 — journal/date filters, PMC reports, PDF upload, library"
```

---

## Self-Review (completed by author)

**Spec coverage:** 학회지 수집(저널 [ta] 필터, Thieme=APS/JRM) → Tasks 1/2/5; 주간/월간 최신(reldate 7/30) → Tasks 2/4/5; 논문 전반 분석(PMC 풀텍스트→report mode) → Tasks 2/3/5; PDF 업로드 전체분석 → Tasks 3/4/5; 한/영 병기 리포트 → Task 3 REPORT_FORMAT; 레포트 제출(저장 라이브러리 + .md 다운로드) → Tasks 1(마이그레이션)/3/4/5; 성형외과 파일럿(공작, 쿼리, 레지스트리) → Task 1. ✓
**Placeholders:** none. **Type consistency:** `Paper.pmcid` (T2) used in T4/T5; `FetchOptions` (T2) matches T5 call; `requestReport(client, paper, specialty, {fulltext|pdfBase64})` (T3) matches T5; `saveAnalysis(..., meta)` (T3) matches T5; PapersSection props (T4) match T5 wiring; `journalsFor` (T1) used T4/T5. Existing `requestAnalysis` kept for abstract path. ✓
**Known limits (by design):** 유료지 본문 스크래핑 없음; 리포트 markdown은 plain 렌더(스타일드 md 렌더러는 추후); 주간 자동 cron은 다음 slice.
