# ResQ Todos & Schedule v2 Implementation Plan (Slice 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make section 2 genuinely useful — todos gain 음성 입력(Web Speech), 우선순위+마감시간 with auto-ordering, and paste-an-image/memo → AI todo extraction (review-then-add); the calendar gains a month/year quick picker; both cards get a readability-first redesign; the hero's three top-right icons become real quick links.

**Architecture:** Migration 0009 adds `todos.priority`/`todos.due_time`. `src/lib/todos.ts` v2 adds the fields + pure `sortTodos` (undone → priority high→low → due date/time → created). New `extract-todos` edge function (Claude; accepts memo text OR base64 image via a vision content block) + `src/lib/todoExtract.ts` client (validation identical in spirit to gmail's `isValidExtractedEvent`). UI: `TodoSection` v2 (priority pills, due date+time inputs, mic button behind a SpeechRecognition capability check, paste zone, extracted-review list, new surface styling), `ScheduleSection` v2 (`MonthPicker` popover, bigger/clearer grid, today ring, weekend tints), Hero quick links via a `SOCIETY_HOMEPAGE` config in sources.ts.

**Tech Stack:** unchanged; Web Speech API is a browser built-in (graceful when absent). No new deps.
**Branch:** `feat/home-sections`.

---

## File Structure

```
supabase/migrations/0009_todo_priority.sql
supabase/functions/extract-todos/index.ts
src/lib/todos.ts (+test upd)            # priority/due_time fields, addTodo opts, sortTodos
src/lib/todoExtract.ts (+test)          # invoke + validate extracted todos
src/lib/sources.ts (+test upd)          # SOCIETY_HOMEPAGE config + societyFor()
src/components/sections/TodoSection.tsx (+test upd)
src/components/sections/ScheduleSection.tsx (+test upd)
src/components/Hero.tsx                  # quick links
src/home/HomeSections.tsx                # wiring (addTodo opts, extraction handlers)
```

---

### Task 1: Migration + todos lib v2

**Files:** create `supabase/migrations/0009_todo_priority.sql`; modify `src/lib/todos.ts`, `src/lib/todos.test.ts`

- [ ] **Step 1: Migration** (do NOT apply):

```sql
-- Slice 7: todo priority + due time. Re-runnable.
alter table public.todos
  add column if not exists priority text not null default 'normal', -- high | normal | low
  add column if not exists due_time text;                            -- 'HH:mm' | null
```

- [ ] **Step 2: todos.ts v2.**

```ts
export type TodoPriority = 'high' | 'normal' | 'low'

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
  high: '높음', normal: '보통', low: '낮음',
}
/** Left-bar / pill colors per priority (readability accents). */
export const PRIORITY_COLOR: Record<TodoPriority, string> = {
  high: '#ff6b6b', normal: '#5aa9ff', low: '#8a93a6',
}
```

`Todo` gains `priority: TodoPriority` and `due_time: string | null`. `addTodo` signature becomes:

```ts
export async function addTodo(
  client: SupabaseClient,
  userId: string,
  title: string,
  dueDate: string | null,
  opts: { priority?: TodoPriority; dueTime?: string | null } = {},
): Promise<Todo> {
  const { data, error } = await client
    .from('todos')
    .insert({
      user_id: userId,
      title,
      due_date: dueDate,
      priority: opts.priority ?? 'normal',
      due_time: opts.dueTime ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Todo
}
```

Add pure sorter (used by the UI so the list always reads in action order):

```ts
const PRIORITY_RANK: Record<TodoPriority, number> = { high: 0, normal: 1, low: 2 }

/** Undone first → priority → due date+time (missing due last) → stable. */
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const pr = PRIORITY_RANK[a.priority ?? 'normal'] - PRIORITY_RANK[b.priority ?? 'normal']
    if (pr !== 0) return pr
    const da = a.due_date ? `${a.due_date}T${a.due_time ?? '23:59'}` : '9999-12-31T23:59'
    const db = b.due_date ? `${b.due_date}T${b.due_time ?? '23:59'}` : '9999-12-31T23:59'
    return da.localeCompare(db)
  })
}
```

- [ ] **Step 3: Tests.** Update the `t1` fixture (+`priority: 'normal', due_time: null`) and the addTodo assertion (called args include priority normal); add:

```ts
describe('sortTodos', () => {
  const t = (o: Partial<Todo>): Todo => ({
    id: 'x', user_id: 'u', title: 't', done: false, due_date: null,
    xp_granted: false, priority: 'normal', due_time: null, ...o,
  })
  it('orders undone→priority→due datetime, done last', () => {
    const list = [
      t({ id: 'done', done: true, priority: 'high' }),
      t({ id: 'low', priority: 'low' }),
      t({ id: 'high-late', priority: 'high', due_date: '2026-07-22', due_time: '18:00' }),
      t({ id: 'high-early', priority: 'high', due_date: '2026-07-22', due_time: '08:00' }),
      t({ id: 'normal', priority: 'normal', due_date: '2026-07-21' }),
    ]
    expect(sortTodos(list).map((x) => x.id)).toEqual(['high-early', 'high-late', 'normal', 'low', 'done'])
  })
  it('does not mutate', () => {
    const list = [t({ id: 'a' }), t({ id: 'b', done: true })]
    sortTodos(list)
    expect(list[0].id).toBe('a')
  })
})
```

`addTodo` opts test: `await addTodo(c, 'u1', '회진', '2026-07-21', { priority: 'high', dueTime: '07:30' })` → insert args contain those.

- [ ] **Step 4:** PASS + full suite green (HomeSections caller updated in Task 5 — until then the 4-arg call still typechecks since opts is optional). Commit `feat(todos): priority, due time and action-order sorting`.

---

### Task 2: extract-todos edge function + client

**Files:** create `supabase/functions/extract-todos/index.ts`, `src/lib/todoExtract.ts`, `src/lib/todoExtract.test.ts`

- [ ] **Step 1: Edge function** (mirror extract-events structure; JWT-verified deploy, shared ANTHROPIC_API_KEY):

```ts
// Edge Function: extract-todos — Claude turns a pasted memo/photo into todo items.
// Deploy: supabase functions deploy extract-todos
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { text, imageBase64, mediaType, specialty } = await req.json()
    if (!text && !imageBase64) {
      return Response.json({ todos: [] }, { headers: CORS })
    }
    const instruction =
      `${specialty ?? '의학'} 전공의의 메모/사진에서 실행 가능한 할일만 추출해 JSON으로 반환하세요. ` +
      `형식: {"todos":[{"title":string,"due_date":"YYYY-MM-DD"|null,"due_time":"HH:mm"|null,` +
      `"priority":"high"|"normal"|"low"}]} 마감이 불명확하면 null, 우선순위가 불명확하면 "normal". ` +
      `JSON 외 다른 텍스트 금지. 할일이 없으면 {"todos":[]}.`
    const content: unknown[] = imageBase64
      ? [
          { type: 'image', source: { type: 'base64', media_type: mediaType ?? 'image/png', data: imageBase64 } },
          { type: 'text', text: instruction },
        ]
      : [{ type: 'text', text: `${instruction}\n\n메모:\n${text}` }]
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
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return Response.json({ error: `anthropic ${res.status}: ${detail}` }, { status: 502, headers: CORS })
    }
    const data = await res.json()
    const raw: string = data.content?.[0]?.text ?? '{"todos":[]}'
    const jsonText = raw.replace(/^```(json)?/m, '').replace(/```$/m, '').trim()
    let todos: unknown[] = []
    try { todos = JSON.parse(jsonText).todos ?? [] } catch { todos = [] }
    return Response.json({ todos }, { headers: CORS })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS })
  }
})
```

- [ ] **Step 2: Client `src/lib/todoExtract.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TodoPriority } from './todos'

export interface ExtractedTodo {
  title: string
  due_date: string | null
  due_time: string | null
  priority: TodoPriority
}

const PRIORITIES = new Set(['high', 'normal', 'low'])

function isValidExtractedTodo(t: unknown): t is ExtractedTodo {
  if (typeof t !== 'object' || t === null) return false
  const v = t as Record<string, unknown>
  if (typeof v.title !== 'string' || v.title.trim().length === 0) return false
  if (v.due_date != null && (typeof v.due_date !== 'string' || Number.isNaN(new Date(v.due_date).getTime()))) return false
  if (v.due_time != null && (typeof v.due_time !== 'string' || !/^\d{2}:\d{2}$/.test(v.due_time))) return false
  return true
}

/** Claude-backed extraction of todos from a pasted memo or image. Untrusted LLM
 *  output is validated/normalized here so malformed items can never crash the UI. */
export async function requestTodoExtraction(
  client: SupabaseClient,
  input: { text?: string; imageBase64?: string; mediaType?: string },
  specialty: string | null,
): Promise<ExtractedTodo[]> {
  const { data, error } = await client.functions.invoke('extract-todos', {
    body: { ...input, specialty },
  })
  if (error || !data?.todos) {
    throw new Error('추출 서버 오류 — ANTHROPIC_API_KEY 시크릿 미설정 또는 함수 미배포일 수 있습니다.')
  }
  return (data.todos as unknown[]).filter(isValidExtractedTodo).map((t) => ({
    title: t.title.trim(),
    due_date: t.due_date ?? null,
    due_time: t.due_time ?? null,
    priority: PRIORITIES.has(t.priority as string) ? (t.priority as TodoPriority) : 'normal',
  }))
}
```

- [ ] **Step 3: Tests `src/lib/todoExtract.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { requestTodoExtraction } from './todoExtract'

function client(result: any) {
  return { functions: { invoke: vi.fn().mockResolvedValue(result) } } as any
}

describe('requestTodoExtraction', () => {
  it('passes text/image input through and returns valid todos', async () => {
    const c = client({ data: { todos: [{ title: '초록 제출', due_date: '2026-07-25', due_time: '17:00', priority: 'high' }] }, error: null })
    const out = await requestTodoExtraction(c, { text: '메모' }, '성형외과')
    expect(out).toEqual([{ title: '초록 제출', due_date: '2026-07-25', due_time: '17:00', priority: 'high' }])
    expect(c.functions.invoke.mock.calls[0][0]).toBe('extract-todos')
    expect(c.functions.invoke.mock.calls[0][1].body.text).toBe('메모')
  })
  it('drops malformed items and normalizes bad priorities', async () => {
    const c = client({ data: { todos: [
      { title: 'ok', priority: 'urgent!!' },          // bad priority → normal
      { title: '', priority: 'high' },                 // no title → dropped
      { title: 'bad date', due_date: 'not-a-date' },   // dropped
      { title: 'bad time', due_time: '25시' },         // dropped
      'garbage',
    ] }, error: null })
    const out = await requestTodoExtraction(c, { text: 'x' }, null)
    expect(out).toEqual([{ title: 'ok', due_date: null, due_time: null, priority: 'normal' }])
  })
  it('throws a friendly error when unreachable', async () => {
    const c = client({ data: null, error: { message: 'x' } })
    await expect(requestTodoExtraction(c, { text: 'x' }, null)).rejects.toThrow(/추출 서버/)
  })
})
```

- [ ] **Step 4:** PASS; `npm run build` unaffected. Commit `feat(todos): AI extraction from pasted memos and photos`.

---

### Task 3: Society homepage config

**Files:** modify `src/lib/sources.ts`, `src/lib/sources.test.ts`

- [ ] **Step 1:** Add config + accessor (bottom of sources.ts):

```ts
/** 전공 학회 공식 홈페이지 (hero 퀵링크). Unknown → 대한의사협회. */
const SOCIETY_HOMEPAGE: Record<string, string> = {
  성형외과: 'https://www.plasticsurgery.or.kr',
  피부과: 'https://www.derma.or.kr',
  내과: 'https://www.kaim.or.kr',
  정형외과: 'https://www.koa.or.kr',
  외과: 'https://www.surgery.or.kr',
  마취통증의학과: 'https://www.anesthesia.or.kr',
  응급의학과: 'https://www.emergency.or.kr',
  신경외과: 'https://www.neurosurgery.or.kr',
  산부인과: 'https://www.ksog.org',
  소아청소년과: 'https://www.pediatrics.or.kr',
}

export function societyFor(specialty: string | null | undefined): string {
  return SOCIETY_HOMEPAGE[canonicalSpecialty(specialty)] ?? 'https://www.kma.org'
}
```

Tests: `societyFor('성형외과')` contains plasticsurgery; `societyFor('우주과')` contains kma.

- [ ] **Step 2:** Commit `feat(sources): specialty society homepages`.

---

### Task 4: TodoSection v2 + ScheduleSection v2 (redesign)

**Files:** rewrite `src/components/sections/TodoSection.tsx` + test; modify `src/components/sections/ScheduleSection.tsx` + test

**Shared surface style (readability):** cards use `rounded-2xl border border-white/15 bg-[#0B1433]` (lighter than page bg), header `flex items-center gap-2` with a 6px neon square accent + `font-grotesk text-xl uppercase` title, generous `p-6` and `text-[13px]` body type.

- [ ] **Step 1: TodoSection v2.** New props:

```ts
{
  todos: Todo[]
  onAdd: (title: string, opts: { priority: TodoPriority; dueDate: string | null; dueTime: string | null }) => void
  onToggle: (todo: Todo) => void
  onDelete: (id: string) => void
  onExtract: (input: { text?: string; imageBase64?: string; mediaType?: string }) => void
  extracting: boolean
  extracted: ExtractedTodo[]
  onAddExtracted: (t: ExtractedTodo) => void
  onDismissExtracted: () => void
}
```

Features:
- **Add row**: text input (aria `할 일 추가`) + priority pills (높음/보통/낮음 buttons, aria `우선순위 높음` etc., selected = filled with `PRIORITY_COLOR`) + date input (aria `마감일`) + time input (aria `마감 시간`) + 추가 button → `onAdd(title, { priority, dueDate, dueTime })`.
- **음성 입력**: mic button (aria `음성 입력`) rendered ONLY when `window.SpeechRecognition || window.webkitSpeechRecognition` exists. On click: instantiate, `lang='ko-KR'`, `onresult` → append transcript to the title input; `onerror`/`onend` → stop listening state (button pulses `animate-pulse` while listening). Cast `window as any` for the vendor global.
- **붙여넣기 존**: a small dashed sub-card ("메모/사진 붙여넣기 → AI가 할일 생성") with `tabIndex={0}` and an `onPaste` handler (aria-label `할일 붙여넣기 존`): image items → read as base64 (`FileReader.readAsDataURL`, strip prefix, pass mediaType) → `onExtract({ imageBase64, mediaType })`; else text → `onExtract({ text })`. While `extracting` show `AI가 할일을 뽑는 중…`.
- **Extracted review list**: rows title + due + priority label with `할일에 추가` per row and a `닫기` header button → onAddExtracted/onDismissExtracted.
- **List**: render `sortTodos(todos)`; each row: 3px left bar in `PRIORITY_COLOR[t.priority]`, checkbox (aria = title), title, due chip `M/D HH:mm` when present, PRIORITY_LABEL chip, 삭제. Done rows dim+line-through and sink (sortTodos handles order).

Test updates (rewrite `TodoSection.test.tsx`): adapt old cases to new props (add now asserts `onAdd('논문 읽기', { priority: 'high', dueDate: null, dueTime: null })` after clicking 우선순위 높음 pill); add: sorted rendering (high-priority row appears before low within the list DOM order); paste-text fires `onExtract({ text: '회진 준비' })` via `fireEvent.paste(zone, { clipboardData: { items: [], getData: () => '회진 준비' } })`; extracted review add/dismiss; mic button hidden in jsdom by default, and appears when `(window as any).webkitSpeechRecognition = class {...}` is stubbed before render (cleanup after).

- [ ] **Step 2: ScheduleSection v2.**
- **MonthPicker**: the `${year}년 ${month0+1}월` label becomes a button (aria `월 선택`). Clicking toggles a popover panel (`role="dialog"` NOT needed — plain div, aria-label `월 선택 패널`): year row (`이전 해`/`다음 해` arrow buttons around the year number, local picker-year state seeded from prop) + 12 month buttons (`1월`…`12월`, current month highlighted). Selecting a month → `onMonthChange(pickerYear, m)` + close.
- **Redesign**: weekday header 일 tinted `text-red-300`, 토 `text-sky-300`; day cells `min-h-[64px] rounded-lg`, in-month `bg-white/[0.07]`, out-month faded, **today** gets `ring-2 ring-neon` (compute today ISO via `new Date()` locally); event dots grow to 2x2 with up to 3 shown + `+n` overflow count; month event list rows `bg-white/[0.07]` with kind chip colored text instead of tiny dot.
- Tests to add: clicking `월 선택` opens the panel; clicking `다음 해` then `3월` calls `onMonthChange(year+1, 2)`; existing prev/next-month tests unchanged.

- [ ] **Step 3:** PASS both files. Commit `feat(sections): todo/schedule v2 — voice, priorities, paste-AI, month picker, redesign`.

---

### Task 5: Hero quick links + HomeSections wiring + gate

**Files:** modify `src/components/Hero.tsx`, `src/home/HomeSections.tsx`

- [ ] **Step 1: Hero quick links.** Replace the decorative `[Mail, Bird, Globe].map` buttons with:

```tsx
import { societyFor } from '../lib/sources'
```

```tsx
            <div className="hidden gap-2 lg:flex">
              {[
                { Icon: Mail, label: 'Gmail 열기', href: 'https://mail.google.com', external: true },
                { Icon: Bird, label: '일정 · 캘린더 연동', href: '#schedule', external: false },
                { Icon: Globe, label: '전공 학회 홈페이지', href: societyFor(profile.specialty), external: true },
              ].map(({ Icon, label, href, external }) => (
                <LiquidGlass key={label} className="rounded-[1rem]">
                  <a
                    href={href}
                    aria-label={label}
                    title={label}
                    {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    className="flex h-[48px] w-[48px] items-center justify-center transition hover:bg-white/10 hover:text-neon"
                  >
                    <Icon size={18} />
                  </a>
                </LiquidGlass>
              ))}
            </div>
```

Add a Hero test: `getByRole('link', { name: '전공 학회 홈페이지' })` has href containing 'kaim' for 내과 profile (societyFor(내과)=kaim.or.kr) and Gmail link exists.
NOTE: Hero null-mascot test asserts `queryAllByRole('img')` — anchors are links, unaffected.

- [ ] **Step 2: HomeSections wiring.**
- `handleAddTodo` signature → `(title, opts)` passing opts to `addTodo(supabase, userId, title, opts.dueDate, { priority: opts.priority, dueTime: opts.dueTime })`.
- New state: `todoExtracting`, `extractedTodos: ExtractedTodo[]`; handlers:

```tsx
  const handleExtractTodos = async (input: { text?: string; imageBase64?: string; mediaType?: string }) => {
    setTodoExtracting(true)
    try {
      const found = await requestTodoExtraction(supabase, input, profile.specialty)
      setExtractedTodos(found)
    } catch (e) {
      console.error(e)
    } finally {
      setTodoExtracting(false)
    }
  }

  const handleAddExtractedTodo = async (t: ExtractedTodo) => {
    try {
      const added = await addTodo(supabase, userId, t.title, t.due_date, { priority: t.priority, dueTime: t.due_time })
      setTodos((s) => [added, ...s])
      setExtractedTodos((s) => s.filter((x) => x !== t))
    } catch (e) { console.error(e) }
  }
```

- Pass the new TodoSection props.
- [ ] **Step 3: Full gate** — `npm test` green, tsc clean, build OK, dev boots. Commit `feat(home): wire todo v2 extraction and quick links`.

---

## Self-Review (completed by author)

**Coverage:** 음성 입력 → T4 (capability-gated mic); 우선순위/시간 부여+관리 → T1 (schema/sort) + T4 (pills/chips/order) + T5 (wiring); 사진/메모 → 할일 생성 → T2 (edge fn+validated client) + T4 (paste zone + review) + T5; 월/연도 빠른 이동 → T4 MonthPicker; 가독성 재설계 → T4 shared surface/today ring/weekend tints/priority bars; 우상단 아이콘 활성화 → T3 (society config) + T5 (Gmail/#schedule/학회 링크). ✓
**Type consistency:** `TodoPriority`/`PRIORITY_*`/`sortTodos` (T1) used in T4/T5; `ExtractedTodo` (T2) in T4/T5; `addTodo` opts (T1) matches T5 calls; `societyFor` (T3) in T5 Hero. ICS `[할일]` export unaffected (due_date unchanged). ✓
**Safety:** extraction output validated client-side + human review before insert (same pattern as gmail events). Voice/paste live entirely in-browser. ✓
**Post-merge operator note:** apply 0009; deploy `extract-todos` (Claude does this via linked CLI); ANTHROPIC_API_KEY secret still the user's one command.
