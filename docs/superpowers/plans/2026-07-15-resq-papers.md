# ResQ Papers Section Implementation Plan (Slice 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill home section 4 — fetch the latest PubMed papers for the user's specialty, show them as cards, and open an AI breakdown drawer (Korean summary via a Claude-backed Supabase Edge Function, cached per user; graceful fallback when the function isn't deployed). First successful analysis of a paper grants `read_paper` XP (+20).

**Architecture:** `src/lib/pubmed.ts` is pure/injectable: specialty→English-query map, `fetchRecentPapers(specialty, fetcher)` (esearch JSON → efetch XML), and `parsePubmedArticles(xml)` via DOMParser (works in browser and jsdom). Analyses are cached in a `paper_analyses` table (RLS, unique per user+pmid). The Edge Function `analyze-paper` holds the Anthropic key server-side — the client invokes it through `supabase.functions.invoke`. `PapersSection` renders cards + a detail drawer; `HomeSections` wires state, caching, and the XP latch (XP only on first successful analysis creation).

**Tech Stack:** unchanged; Edge Function is Deno (deployment artifact, outside the app's tsconfig). No new app deps.

**Branch:** `feat/home-sections`.

**Operator prerequisites (for LIVE use, not for tests/build):** apply migration 0005; `supabase functions deploy analyze-paper` + `supabase secrets set ANTHROPIC_API_KEY=...`. Without deployment the UI shows the abstract + a notice instead of the AI analysis.

---

## File Structure

```
supabase/migrations/0005_paper_analyses.sql
supabase/functions/analyze-paper/index.ts     # Deno edge fn (Claude call, CORS)
src/lib/pubmed.ts                              # query map + fetch + XML parse
src/lib/pubmed.test.ts
src/lib/papers.ts                              # analyses cache data access + invoke
src/lib/papers.test.ts
src/components/sections/PapersSection.tsx
src/components/sections/PapersSection.test.tsx
src/home/HomeSections.tsx                      # wire section 4
```

---

### Task 1: Migration + Edge Function

**Files:**
- Create: `supabase/migrations/0005_paper_analyses.sql`, `supabase/functions/analyze-paper/index.ts`

- [ ] **Step 1: Write `supabase/migrations/0005_paper_analyses.sql`**

```sql
-- Slice 5: cached AI analyses of papers. Re-runnable.
create table if not exists public.paper_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pmid text not null,
  title text not null,
  journal text,
  year text,
  abstract text,
  analysis text not null,
  created_at timestamptz not null default now(),
  unique (user_id, pmid)
);
create index if not exists paper_analyses_user_idx on public.paper_analyses (user_id, created_at);

alter table public.paper_analyses enable row level security;

drop policy if exists "paper_analyses_all_own" on public.paper_analyses;
create policy "paper_analyses_all_own" on public.paper_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Write `supabase/functions/analyze-paper/index.ts`** (Deno; NOT part of the Vite app — do not import it anywhere in `src/`)

```ts
// Supabase Edge Function: analyze-paper
// Deploy: supabase functions deploy analyze-paper
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { title, abstract, specialty } = await req.json()
    if (!title || !abstract) {
      return Response.json({ error: 'title and abstract required' }, { status: 400, headers: CORS })
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
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content:
            `당신은 ${specialty ?? '의학'} 전공의를 돕는 논문 분석 비서입니다. ` +
            `다음 논문 초록을 한국어로 분석해주세요. 형식: ① 세 줄 요약 ② 연구 방법 ` +
            `③ 핵심 결과 ④ 임상적 의의 ⑤ 한계점. 간결하고 정확하게.\n\n` +
            `제목: ${title}\n\n초록:\n${abstract}`,
        }],
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

- [ ] **Step 3:** Confirm the app still builds (`npm run build`) — the function lives outside `src/` and must not affect the app bundle. Commit:

```bash
git add -A
git commit -m "feat(papers): paper_analyses migration and analyze-paper edge function"
```

---

### Task 2: PubMed module (pure + injectable)

**Files:**
- Create: `src/lib/pubmed.ts`, `src/lib/pubmed.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/pubmed.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { pubmedQueryFor, parsePubmedArticles, fetchRecentPapers } from './pubmed'

const XML = `<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>111</PMID>
      <Article>
        <Journal><Title>NEJM</Title><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal>
        <ArticleTitle>Semaglutide outcomes</ArticleTitle>
        <Abstract><AbstractText Label="BACKGROUND">Part one.</AbstractText><AbstractText>Part two.</AbstractText></Abstract>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>222</PMID>
      <Article>
        <Journal><Title>Lancet</Title><JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue></Journal>
        <ArticleTitle>No abstract paper</ArticleTitle>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>`

describe('pubmedQueryFor', () => {
  it('maps specialties to English queries with a generic fallback', () => {
    expect(pubmedQueryFor('내과')).toContain('internal medicine')
    expect(pubmedQueryFor('정형외과')).toContain('orthopedic')
    expect(pubmedQueryFor('우주과')).toContain('medicine')
    expect(pubmedQueryFor(null)).toContain('medicine')
  })
})

describe('parsePubmedArticles', () => {
  it('extracts pmid/title/journal/year/abstract and builds the URL', () => {
    const papers = parsePubmedArticles(XML)
    expect(papers).toHaveLength(2)
    expect(papers[0]).toMatchObject({
      pmid: '111',
      title: 'Semaglutide outcomes',
      journal: 'NEJM',
      year: '2026',
      url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
    })
    expect(papers[0].abstract).toBe('Part one. Part two.')
    expect(papers[1].abstract).toBe('')
  })
})

describe('fetchRecentPapers', () => {
  it('searches then fetches and parses', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ esearchresult: { idlist: ['111', '222'] } }) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(XML) })
    const papers = await fetchRecentPapers('내과', fetcher as any)
    expect(papers).toHaveLength(2)
    expect(fetcher.mock.calls[0][0]).toContain('esearch.fcgi')
    expect(fetcher.mock.calls[0][0]).toContain(encodeURIComponent('internal medicine'))
    expect(fetcher.mock.calls[1][0]).toContain('efetch.fcgi')
    expect(fetcher.mock.calls[1][0]).toContain('111%2C222')
  })
  it('returns [] when the search has no hits', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ esearchresult: { idlist: [] } }) })
    expect(await fetchRecentPapers('내과', fetcher as any)).toEqual([])
  })
  it('throws on a failed search response', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(fetchRecentPapers('내과', fetcher as any)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify FAIL**, then create `src/lib/pubmed.ts`

```ts
export interface Paper {
  pmid: string
  title: string
  journal: string
  year: string
  abstract: string
  url: string
}

/** 전공 → PubMed 검색어 (config). Unmapped → generic medicine. */
const SPECIALTY_QUERY: Record<string, string> = {
  내과: 'internal medicine',
  정형외과: 'orthopedic surgery',
  외과: 'general surgery',
  마취통증의학과: 'anesthesiology OR pain medicine',
  소아청소년과: 'pediatrics',
  산부인과: 'obstetrics gynecology',
  정신건강의학과: 'psychiatry',
  영상의학과: 'radiology',
  응급의학과: 'emergency medicine',
  신경과: 'neurology',
  신경외과: 'neurosurgery',
  피부과: 'dermatology',
  이비인후과: 'otolaryngology',
  안과: 'ophthalmology',
  비뇨의학과: 'urology',
  가정의학과: 'family medicine',
}

export function pubmedQueryFor(specialty: string | null | undefined): string {
  return SPECIALTY_QUERY[specialty ?? ''] ?? 'medicine'
}

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

export function parsePubmedArticles(xml: string): Paper[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return Array.from(doc.querySelectorAll('PubmedArticle')).map((a) => {
    const pmid = a.querySelector('PMID')?.textContent ?? ''
    const abstract = Array.from(a.querySelectorAll('AbstractText'))
      .map((n) => n.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
    return {
      pmid,
      title: a.querySelector('ArticleTitle')?.textContent ?? '(제목 없음)',
      journal: a.querySelector('Journal > Title')?.textContent ?? '',
      year: a.querySelector('PubDate > Year')?.textContent ?? '',
      abstract,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }
  })
}

/** Latest N papers for a specialty via E-utilities (CORS-enabled by NCBI). */
export async function fetchRecentPapers(
  specialty: string | null | undefined,
  fetcher: typeof fetch = fetch,
  retmax = 9,
): Promise<Paper[]> {
  const term = pubmedQueryFor(specialty)
  const searchUrl =
    `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=pub_date&retmax=${retmax}` +
    `&term=${encodeURIComponent(term)}`
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

- [ ] **Step 3: Run to verify PASS (6 tests), commit**

```bash
git add -A
git commit -m "feat(papers): pubmed query map, fetch and XML parsing"
```

---

### Task 3: Analyses data access

**Files:**
- Create: `src/lib/papers.ts`, `src/lib/papers.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/papers.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { getAnalysis, saveAnalysis, requestAnalysis, type PaperAnalysis } from './papers'
import type { Paper } from './pubmed'

const paper: Paper = {
  pmid: '111', title: 'T', journal: 'J', year: '2026', abstract: 'A', url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
}

function fakeClient(row: PaperAnalysis | null, invokeResult: any = { data: { analysis: '분석' }, error: null }) {
  const calls: { op: string; args: any }[] = []
  return {
    calls,
    functions: { invoke: (name: string, opts: any) => { calls.push({ op: `invoke:${name}`, args: opts.body }); return Promise.resolve(invokeResult) } },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
      }),
      upsert: (values: any) => ({
        select: () => ({
          single: () => { calls.push({ op: 'upsert', args: values }); return Promise.resolve({ data: { id: 'pa1', ...values }, error: null }) },
        }),
      }),
    }),
  } as any
}

describe('papers data access', () => {
  it('getAnalysis returns null when uncached', async () => {
    expect(await getAnalysis(fakeClient(null), 'u1', '111')).toBeNull()
  })
  it('requestAnalysis invokes the edge function and returns the text', async () => {
    const c = fakeClient(null)
    const text = await requestAnalysis(c, paper, '내과')
    expect(text).toBe('분석')
    expect(c.calls[0].op).toBe('invoke:analyze-paper')
  })
  it('requestAnalysis throws a friendly error when the function is unreachable', async () => {
    const c = fakeClient(null, { data: null, error: { message: 'Failed to send a request' } })
    await expect(requestAnalysis(c, paper, '내과')).rejects.toThrow(/분석 서버/)
  })
  it('saveAnalysis upserts the row with user and pmid', async () => {
    const c = fakeClient(null)
    const row = await saveAnalysis(c, 'u1', paper, '분석 결과')
    expect(row.analysis).toBe('분석 결과')
    expect(c.calls[0].args.user_id).toBe('u1')
    expect(c.calls[0].args.pmid).toBe('111')
  })
})
```

- [ ] **Step 2: Run to verify FAIL**, then create `src/lib/papers.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Paper } from './pubmed'

export interface PaperAnalysis {
  id: string
  user_id: string
  pmid: string
  title: string
  journal: string | null
  year: string | null
  abstract: string | null
  analysis: string
}

export async function getAnalysis(
  client: SupabaseClient,
  userId: string,
  pmid: string,
): Promise<PaperAnalysis | null> {
  const { data, error } = await client
    .from('paper_analyses')
    .select('*')
    .eq('user_id', userId)
    .eq('pmid', pmid)
    .maybeSingle()
  if (error) throw error
  return (data as PaperAnalysis) ?? null
}

/** Ask the Claude-backed edge function for a Korean breakdown. */
export async function requestAnalysis(
  client: SupabaseClient,
  paper: Paper,
  specialty: string | null,
): Promise<string> {
  const { data, error } = await client.functions.invoke('analyze-paper', {
    body: { title: paper.title, abstract: paper.abstract, specialty },
  })
  if (error || !data?.analysis) {
    throw new Error('분석 서버에 연결할 수 없습니다. (analyze-paper 함수 배포 필요)')
  }
  return data.analysis as string
}

export async function saveAnalysis(
  client: SupabaseClient,
  userId: string,
  paper: Paper,
  analysis: string,
): Promise<PaperAnalysis> {
  const { data, error } = await client
    .from('paper_analyses')
    .upsert({
      user_id: userId,
      pmid: paper.pmid,
      title: paper.title,
      journal: paper.journal,
      year: paper.year,
      abstract: paper.abstract,
      analysis,
    }, { onConflict: 'user_id,pmid' })
    .select()
    .single()
  if (error) throw error
  return data as PaperAnalysis
}
```

- [ ] **Step 3: Run to verify PASS (4 tests), commit**

```bash
git add -A
git commit -m "feat(papers): analysis cache data access and edge invocation"
```

---

### Task 4: PapersSection component

**Files:**
- Create: `src/components/sections/PapersSection.tsx`, `src/components/sections/PapersSection.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/sections/PapersSection.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PapersSection } from './PapersSection'
import type { Paper } from '../../lib/pubmed'

const papers: Paper[] = [
  { pmid: '111', title: 'Semaglutide outcomes', journal: 'NEJM', year: '2026', abstract: 'Abs one', url: 'https://pubmed.ncbi.nlm.nih.gov/111/' },
  { pmid: '222', title: 'AKI biomarkers', journal: 'Lancet', year: '2025', abstract: 'Abs two', url: 'https://pubmed.ncbi.nlm.nih.gov/222/' },
]

describe('PapersSection', () => {
  it('renders paper cards and a refresh button', () => {
    render(<PapersSection papers={papers} loading={false} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={null} analysis={null}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    expect(screen.getByText('Semaglutide outcomes')).toBeInTheDocument()
    expect(screen.getByText(/NEJM/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새 논문 불러오기' })).toBeInTheDocument()
  })
  it('calls onRefresh and onOpen', async () => {
    const onRefresh = vi.fn(); const onOpen = vi.fn()
    render(<PapersSection papers={papers} loading={false} error={null}
      onRefresh={onRefresh} onOpen={onOpen} selected={null} analysis={null}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '새 논문 불러오기' }))
    expect(onRefresh).toHaveBeenCalled()
    const card = screen.getByText('Semaglutide outcomes').closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: 'AI 분석 열기' }))
    expect(onOpen).toHaveBeenCalledWith(papers[0])
  })
  it('shows the drawer with analysis when a paper is selected', () => {
    render(<PapersSection papers={papers} loading={false} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={papers[0]} analysis={'① 요약...'}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    expect(screen.getByText('① 요약...')).toBeInTheDocument()
    expect(screen.getByText('Abs one')).toBeInTheDocument()
  })
  it('shows a friendly notice when analysis failed', () => {
    render(<PapersSection papers={papers} loading={false} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={papers[0]} analysis={null}
      analysisLoading={false} analysisError={'분석 서버에 연결할 수 없습니다.'} onClose={vi.fn()} />)
    expect(screen.getByText(/분석 서버에 연결할 수 없습니다/)).toBeInTheDocument()
  })
  it('shows empty and loading states', () => {
    const { rerender } = render(<PapersSection papers={[]} loading={true} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={null} analysis={null}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument()
    rerender(<PapersSection papers={[]} loading={false} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={null} analysis={null}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    expect(screen.getByText(/새 논문 불러오기.*를 눌러/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify FAIL**, then create `src/components/sections/PapersSection.tsx`

```tsx
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
```

- [ ] **Step 3: Run to verify PASS (5 tests), commit**

```bash
git add -A
git commit -m "feat(sections): PapersSection cards and analysis drawer"
```

---

### Task 5: Wire papers into HomeSections + full gate

**Files:**
- Modify: `src/home/HomeSections.tsx`

- [ ] **Step 1: Add imports:**

```tsx
import { fetchRecentPapers, type Paper } from '../lib/pubmed'
import { getAnalysis, requestAnalysis, saveAnalysis } from '../lib/papers'
import { PapersSection } from '../components/sections/PapersSection'
```

- [ ] **Step 2: State + handlers inside the component:**

```tsx
  const [papers, setPapers] = useState<Paper[]>([])
  const [papersLoading, setPapersLoading] = useState(false)
  const [papersError, setPapersError] = useState<string | null>(null)
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const handleRefreshPapers = async () => {
    setPapersLoading(true)
    setPapersError(null)
    try {
      setPapers(await fetchRecentPapers(profile.specialty))
    } catch (e) {
      console.error(e)
      setPapersError('논문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setPapersLoading(false)
    }
  }

  const handleOpenPaper = async (p: Paper) => {
    setSelectedPaper(p)
    setAnalysis(null)
    setAnalysisError(null)
    setAnalysisLoading(true)
    try {
      const cached = await getAnalysis(supabase, userId, p.pmid)
      if (cached) {
        setAnalysis(cached.analysis)
        return
      }
      if (!p.abstract) {
        setAnalysisError('초록이 없는 논문은 분석할 수 없습니다. 원문 링크를 확인해주세요.')
        return
      }
      const text = await requestAnalysis(supabase, p, profile.specialty)
      await saveAnalysis(supabase, userId, p, text)
      setAnalysis(text)
      // First successful analysis of this paper → read_paper XP (+20).
      const updated = await recordXpEvent(supabase, profile, 'read_paper')
      onProfileChange(updated)
    } catch (e) {
      console.error(e)
      setAnalysisError(e instanceof Error ? e.message : '분석에 실패했습니다.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const handleClosePaper = () => { setSelectedPaper(null); setAnalysis(null); setAnalysisError(null) }
```

- [ ] **Step 3: Replace the section-4 placeholder** (keep `id="papers"`):

```tsx
      <section id="papers" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          논문 <span className="font-condiment normal-case text-neon">breakdown</span>
        </h2>
        <PapersSection
          papers={papers}
          loading={papersLoading}
          error={papersError}
          onRefresh={handleRefreshPapers}
          onOpen={handleOpenPaper}
          selected={selectedPaper}
          analysis={analysis}
          analysisLoading={analysisLoading}
          analysisError={analysisError}
          onClose={handleClosePaper}
        />
      </section>
```

- [ ] **Step 4: Full gate** — `npm test` all green, `npx tsc -b --noEmit` clean, `npm run build` succeeds, `npm run dev` boots clean (no login).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(home): wire papers section with PubMed fetch and AI drawer"
```

---

## Self-Review (completed by author)

**Spec coverage (Slice 5 of the M2 master spec):** PubMed 수집 → Task 2; AI 분석(서버측 키) → Task 1 (edge fn) + Task 3 (invoke); 캐시 → Tasks 1/3; 카드+드로어 UI → Task 4; read_paper XP → Task 5 (first-analysis latch via cache-miss path); 키 미배포 시 우아한 안내 → Tasks 3/4. ✓
**Placeholders:** none. **Type consistency:** `Paper` (Task 2) used by Tasks 3/4/5; `PapersSection` props match Task 5 wiring; `requestAnalysis(client, paper, specialty)` and `saveAnalysis(client, userId, paper, text)` signatures consistent; `recordXpEvent(..., 'read_paper')` matches the existing `Exclude<XpEventType,'daily_login'>` signature. `line-clamp-3` requires Tailwind ≥3.3 (bundled core plugin — available in 3.4). ✓
**XP note:** the latch is "no cached row existed and analysis succeeded" — reopening a paper hits the cache and does not re-grant. Deliberately no XP when the edge function isn't deployed.
