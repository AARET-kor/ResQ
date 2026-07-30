# ResQ Todos + Schedule Section Implementation Plan (Slice 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add home scroll section 2 — a personal todo list (completion grants Qbi XP) and a month-calendar schedule with event CRUD — plus placeholder anchors for the upcoming team/papers sections.

**Architecture:** New `todos`/`events` tables (RLS, per-user). Pure month-grid logic in `src/lib/calendar.ts`. Data access modules follow the `profile.ts` injected-client pattern. A generic `recordXpEvent` joins the existing XP ledger; todo first-completion emits `schedule_done` (+8) guarded by an `xp_granted` flag. UI: `TodoSection` + `ScheduleSection` presentational components composed by `HomeSections` (which owns supabase-backed hooks), rendered by App under the Hero. Nav anchors scroll to sections.

**Tech Stack:** unchanged (React 19/TS/Vite/Tailwind/Vitest). No new deps.

**Branch:** `feat/home-sections` (stacked on `feat/mascot`).

---

## File Structure

```
supabase/migrations/0003_todos_events.sql
src/lib/calendar.ts                    # monthGrid pure logic
src/lib/todos.ts                       # Todo type + CRUD data access
src/lib/events.ts                      # EventItem type + CRUD data access
src/mascot/mascot.ts                   # + recordXpEvent (generic, no day-uniqueness)
src/components/sections/TodoSection.tsx
src/components/sections/ScheduleSection.tsx
src/home/HomeSections.tsx              # hooks + section composition + placeholders
src/App.tsx                            # render <HomeSections> under Hero
src/App.test.tsx                       # mock ./home/HomeSections
src/components/Hero.tsx                # nav: 캘린더 tab → active anchor #schedule
```

---

### Task 1: Migration + pure calendar logic

**Files:**
- Create: `supabase/migrations/0003_todos_events.sql`, `src/lib/calendar.ts`, `src/lib/calendar.test.ts`

- [ ] **Step 1: Write `supabase/migrations/0003_todos_events.sql`**

```sql
-- Slice 3: personal todos + schedule events. Re-runnable.
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_date date,
  xp_granted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists todos_user_idx on public.todos (user_id, created_at);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  kind text not null default 'other',
  location text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists events_user_starts_idx on public.events (user_id, starts_at);

alter table public.todos enable row level security;
alter table public.events enable row level security;

drop policy if exists "todos_all_own" on public.todos;
create policy "todos_all_own" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "events_all_own" on public.events;
create policy "events_all_own" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Write the failing test `src/lib/calendar.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { monthGrid, monthRangeISO } from './calendar'

describe('monthGrid', () => {
  it('returns 42 cells starting on Sunday', () => {
    const cells = monthGrid(2026, 6) // July 2026 (month0)
    expect(cells).toHaveLength(42)
    // 2026-07-01 is a Wednesday → grid starts Sun 2026-06-28
    expect(cells[0].date).toBe('2026-06-28')
    expect(cells[3].date).toBe('2026-07-01')
    expect(cells[3].inMonth).toBe(true)
    expect(cells[0].inMonth).toBe(false)
  })
  it('marks all in-month days and only them', () => {
    const cells = monthGrid(2026, 1) // Feb 2026 (28 days)
    expect(cells.filter((c) => c.inMonth)).toHaveLength(28)
  })
  it('handles a month starting on Sunday', () => {
    const cells = monthGrid(2026, 2) // March 2026 starts Sunday
    expect(cells[0].date).toBe('2026-03-01')
    expect(cells[0].inMonth).toBe(true)
  })
})

describe('monthRangeISO', () => {
  it('returns inclusive start / exclusive end instants of the month', () => {
    const { start, end } = monthRangeISO(2026, 6)
    expect(start).toBe('2026-07-01')
    expect(end).toBe('2026-08-01')
  })
  it('wraps the year in December', () => {
    const { end } = monthRangeISO(2026, 11)
    expect(end).toBe('2027-01-01')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/calendar.test.ts`
Expected: FAIL — cannot find module `./calendar`.

- [ ] **Step 4: Create `src/lib/calendar.ts`**

```ts
export interface DayCell {
  date: string // YYYY-MM-DD (local)
  inMonth: boolean
}

function iso(y: number, m0: number, d: number): string {
  const dt = new Date(y, m0, d)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

/** 42-cell (6-week) Sunday-first grid for the given month (month0 = 0-11). */
export function monthGrid(year: number, month0: number): DayCell[] {
  const first = new Date(year, month0, 1)
  const startOffset = first.getDay() // 0 = Sunday
  const cells: DayCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month0, 1 - startOffset + i)
    cells.push({
      date: iso(d.getFullYear(), d.getMonth(), d.getDate()),
      inMonth: d.getMonth() === month0,
    })
  }
  return cells
}

/** [start, end) ISO dates covering the month — for range queries. */
export function monthRangeISO(year: number, month0: number): { start: string; end: string } {
  return { start: iso(year, month0, 1), end: iso(year, month0 + 1, 1) }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/lib/calendar.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(schedule): todos/events migration and month-grid logic"
```

---

### Task 2: Todos + Events data access

**Files:**
- Create: `src/lib/todos.ts`, `src/lib/todos.test.ts`, `src/lib/events.ts`, `src/lib/events.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/todos.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { listTodos, addTodo, setTodoDone, deleteTodo, type Todo } from './todos'

function fakeClient(rows: Todo[]) {
  const calls: { op: string; args: any }[] = []
  const client = {
    calls,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
      insert: (values: any) => ({
        select: () => ({
          single: () => {
            calls.push({ op: 'insert', args: values })
            return Promise.resolve({ data: { id: 't-new', done: false, xp_granted: false, ...values }, error: null })
          },
        }),
      }),
      update: (values: any) => ({
        eq: (_c: string, id: string) => ({
          select: () => ({
            single: () => {
              calls.push({ op: 'update', args: { id, ...values } })
              const row = rows.find((r) => r.id === id)
              return Promise.resolve({ data: { ...row, ...values }, error: null })
            },
          }),
        }),
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          calls.push({ op: 'delete', args: { id } })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  return client as any
}

const t1: Todo = { id: 't1', user_id: 'u1', title: '회진 준비', done: false, due_date: null, xp_granted: false }

describe('todos data access', () => {
  it('lists todos', async () => {
    expect(await listTodos(fakeClient([t1]), 'u1')).toHaveLength(1)
  })
  it('adds a todo with the user id', async () => {
    const c = fakeClient([])
    const t = await addTodo(c, 'u1', '논문 읽기', null)
    expect(t.title).toBe('논문 읽기')
    expect(c.calls[0].args.user_id).toBe('u1')
  })
  it('sets done state and xp_granted', async () => {
    const c = fakeClient([t1])
    const t = await setTodoDone(c, 't1', true, true)
    expect(t.done).toBe(true)
    expect(t.xp_granted).toBe(true)
  })
  it('deletes a todo', async () => {
    const c = fakeClient([t1])
    await deleteTodo(c, 't1')
    expect(c.calls[0]).toEqual({ op: 'delete', args: { id: 't1' } })
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- src/lib/todos.test.ts` → cannot find module.

- [ ] **Step 3: Create `src/lib/todos.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Todo {
  id: string
  user_id: string
  title: string
  done: boolean
  due_date: string | null
  xp_granted: boolean
}

export async function listTodos(client: SupabaseClient, userId: string): Promise<Todo[]> {
  const { data, error } = await client
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Todo[]) ?? []
}

export async function addTodo(
  client: SupabaseClient,
  userId: string,
  title: string,
  dueDate: string | null,
): Promise<Todo> {
  const { data, error } = await client
    .from('todos')
    .insert({ user_id: userId, title, due_date: dueDate })
    .select()
    .single()
  if (error) throw error
  return data as Todo
}

export async function setTodoDone(
  client: SupabaseClient,
  id: string,
  done: boolean,
  xpGranted: boolean,
): Promise<Todo> {
  const { data, error } = await client
    .from('todos')
    .update({ done, xp_granted: xpGranted })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Todo
}

export async function deleteTodo(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('todos').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Write the failing test `src/lib/events.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { listEventsInRange, addEvent, deleteEvent, EVENT_KINDS, type EventItem } from './events'

function fakeClient(rows: EventItem[]) {
  const calls: { op: string; args: any }[] = []
  const client = {
    calls,
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            lt: () => ({
              order: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      }),
      insert: (values: any) => ({
        select: () => ({
          single: () => {
            calls.push({ op: 'insert', args: values })
            return Promise.resolve({ data: { id: 'e-new', ...values }, error: null })
          },
        }),
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          calls.push({ op: 'delete', args: { id } })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  return client as any
}

const e1: EventItem = {
  id: 'e1', user_id: 'u1', title: '학회', starts_at: '2026-07-20T09:00:00+09:00',
  ends_at: null, kind: 'conference', location: null, notes: null,
}

describe('events data access', () => {
  it('lists events in a range', async () => {
    expect(await listEventsInRange(fakeClient([e1]), 'u1', '2026-07-01', '2026-08-01')).toHaveLength(1)
  })
  it('adds an event with user id and kind', async () => {
    const c = fakeClient([])
    const e = await addEvent(c, 'u1', { title: '수술', starts_at: '2026-07-21T08:00:00+09:00', kind: 'surgery' })
    expect(e.kind).toBe('surgery')
    expect(c.calls[0].args.user_id).toBe('u1')
  })
  it('deletes an event', async () => {
    const c = fakeClient([e1])
    await deleteEvent(c, 'e1')
    expect(c.calls[0]).toEqual({ op: 'delete', args: { id: 'e1' } })
  })
  it('exposes Korean labels for every kind', () => {
    for (const k of Object.keys(EVENT_KINDS)) {
      expect(EVENT_KINDS[k as keyof typeof EVENT_KINDS]).toBeTruthy()
    }
    expect(EVENT_KINDS.conference).toBe('학회')
    expect(EVENT_KINDS.surgery).toBe('수술')
  })
})
```

- [ ] **Step 5: Run to verify FAIL**, then create `src/lib/events.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type EventKind = 'conference' | 'surgery' | 'social' | 'professor' | 'other'

export const EVENT_KINDS: Record<EventKind, string> = {
  conference: '학회',
  surgery: '수술',
  social: '회식',
  professor: '교수님',
  other: '기타',
}

export interface EventItem {
  id: string
  user_id: string
  title: string
  starts_at: string // ISO timestamptz
  ends_at: string | null
  kind: EventKind
  location: string | null
  notes: string | null
}

export async function listEventsInRange(
  client: SupabaseClient,
  userId: string,
  startISO: string,
  endISO: string,
): Promise<EventItem[]> {
  const { data, error } = await client
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .order('starts_at', { ascending: true })
  if (error) throw error
  return (data as EventItem[]) ?? []
}

export async function addEvent(
  client: SupabaseClient,
  userId: string,
  values: { title: string; starts_at: string; kind: EventKind; ends_at?: string | null; location?: string | null; notes?: string | null },
): Promise<EventItem> {
  const { data, error } = await client
    .from('events')
    .insert({ user_id: userId, ...values })
    .select()
    .single()
  if (error) throw error
  return data as EventItem
}

export async function deleteEvent(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('events').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 6: Run both test files** — expect PASS (8 tests total).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(schedule): todos and events data access"
```

---

### Task 3: Generic XP event (todo completion → schedule_done)

**Files:**
- Modify: `src/mascot/mascot.ts`, `src/mascot/mascot.test.ts`

- [ ] **Step 1: Add failing tests to `src/mascot/mascot.test.ts`** (append a describe block; also import `recordXpEvent`):

```ts
describe('recordXpEvent', () => {
  it('appends a ledger row and bumps profile xp', async () => {
    const client = fakeClient(base)
    const p = await recordXpEvent(client, base, 'schedule_done')
    expect(p.xp).toBe(48) // 40 + 8
    expect(client.inserts).toEqual([
      { table: 'xp_events', values: { user_id: 'u1', type: 'schedule_done', amount: 8, day: expect.any(String) } },
    ])
  })
  it('does not bump xp when the ledger insert fails', async () => {
    const client = fakeClient(base, { code: '500', message: 'boom' })
    const p = await recordXpEvent(client, base, 'schedule_done')
    expect(p).toBe(base)
  })
})
```

(Import line becomes `import { recordDailyLogin, recordXpEvent } from './mascot'`.)

- [ ] **Step 2: Run to verify FAIL** — `recordXpEvent` not exported.

- [ ] **Step 3: Add to `src/mascot/mascot.ts`** (below `recordDailyLogin`; add `todayISO` import from `./today`):

```ts
/**
 * Generic XP grant for non-login events (schedule_done, read_paper, …).
 * No per-day uniqueness — callers guard repetition themselves (e.g. a todo's
 * xp_granted flag). `day` is recorded for consistency with the ledger schema.
 */
export async function recordXpEvent(
  client: SupabaseClient,
  profile: Profile,
  type: Exclude<XpEventType, 'daily_login'>,
): Promise<Profile> {
  const amount = XP_AMOUNTS[type]
  const { error } = await client
    .from('xp_events')
    .insert({ user_id: profile.id, type, amount, day: todayISO() })
  if (error) return profile
  return upsertProfile(client, { id: profile.id, xp: (profile.xp ?? 0) + amount })
}
```

Imports update: `import { XP_AMOUNTS, type XpEventType } from './events'` and `import { prevDayISO, todayISO } from './today'`.

- [ ] **Step 4: Run full mascot tests** — `npm test -- src/mascot/mascot.test.ts` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): generic recordXpEvent for non-login XP"
```

---

### Task 4: TodoSection component

**Files:**
- Create: `src/components/sections/TodoSection.tsx`, `src/components/sections/TodoSection.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/sections/TodoSection.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoSection } from './TodoSection'
import type { Todo } from '../../lib/todos'

const todos: Todo[] = [
  { id: 't1', user_id: 'u1', title: '회진 준비', done: false, due_date: null, xp_granted: false },
  { id: 't2', user_id: 'u1', title: '컨퍼런스 발표', done: true, due_date: '2026-07-20', xp_granted: true },
]

describe('TodoSection', () => {
  it('renders todos with their done state', () => {
    render(<TodoSection todos={todos} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('회진 준비')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /컨퍼런스 발표/ })).toBeChecked()
  })
  it('adds a todo via the form', async () => {
    const onAdd = vi.fn()
    render(<TodoSection todos={[]} onAdd={onAdd} onToggle={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('할 일 추가'), '논문 읽기')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(onAdd).toHaveBeenCalledWith('논문 읽기')
  })
  it('does not add empty todos', async () => {
    const onAdd = vi.fn()
    render(<TodoSection todos={[]} onAdd={onAdd} onToggle={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(onAdd).not.toHaveBeenCalled()
  })
  it('toggles and deletes', async () => {
    const onToggle = vi.fn()
    const onDelete = vi.fn()
    render(<TodoSection todos={todos} onAdd={vi.fn()} onToggle={onToggle} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /회진 준비/ }))
    expect(onToggle).toHaveBeenCalledWith(todos[0])
    await userEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])
    expect(onDelete).toHaveBeenCalledWith('t1')
  })
})
```

- [ ] **Step 2: Run to verify FAIL**, then create `src/components/sections/TodoSection.tsx`

```tsx
import { useState, type FormEvent } from 'react'
import { LiquidGlass } from '../LiquidGlass'
import type { Todo } from '../../lib/todos'

export function TodoSection({
  todos,
  onAdd,
  onToggle,
  onDelete,
}: {
  todos: Todo[]
  onAdd: (title: string) => void
  onToggle: (todo: Todo) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    onAdd(t)
    setTitle('')
  }

  return (
    <LiquidGlass className="rounded-[24px]">
      <div className="flex flex-col gap-4 p-6">
        <h3 className="font-grotesk text-2xl uppercase">할 일</h3>
        <form onSubmit={submit} className="flex gap-2">
          <input
            aria-label="할 일 추가"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 회진 준비"
            className="flex-1 rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon"
          />
          <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
            추가
          </button>
        </form>
        <ul className="flex flex-col gap-2">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
              <input
                type="checkbox"
                aria-label={t.title}
                checked={t.done}
                onChange={() => onToggle(t)}
                className="h-4 w-4 accent-[#6FFF00]"
              />
              <span className={`flex-1 font-mono text-sm ${t.done ? 'text-cream/40 line-through' : 'text-cream'}`}>
                {t.title}
              </span>
              {t.due_date && <span className="font-mono text-[10px] uppercase text-cream/50">{t.due_date}</span>}
              <button
                onClick={() => onDelete(t.id)}
                className="font-mono text-[10px] uppercase text-cream/40 transition hover:text-red-400"
              >
                삭제
              </button>
            </li>
          ))}
          {todos.length === 0 && (
            <li className="font-mono text-xs uppercase text-cream/40">할 일이 없습니다 — 큐비가 쉬는 중 🐾</li>
          )}
        </ul>
      </div>
    </LiquidGlass>
  )
}
```

- [ ] **Step 3: Run to verify PASS (4 tests), commit**

```bash
git add -A
git commit -m "feat(sections): TodoSection component"
```

---

### Task 5: ScheduleSection component (month grid + add form)

**Files:**
- Create: `src/components/sections/ScheduleSection.tsx`, `src/components/sections/ScheduleSection.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/sections/ScheduleSection.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleSection } from './ScheduleSection'
import type { EventItem } from '../../lib/events'

const events: EventItem[] = [
  { id: 'e1', user_id: 'u1', title: '대한내과학회', starts_at: '2026-07-20T09:00:00+09:00', ends_at: null, kind: 'conference', location: '코엑스', notes: null },
]

describe('ScheduleSection', () => {
  it('renders the month title, grid and events', () => {
    render(<ScheduleSection events={events} year={2026} month0={6}
      onMonthChange={vi.fn()} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('2026년 7월')).toBeInTheDocument()
    expect(screen.getByText('대한내과학회')).toBeInTheDocument()
    expect(screen.getByText(/학회/)).toBeInTheDocument()
  })
  it('navigates months', async () => {
    const onMonthChange = vi.fn()
    render(<ScheduleSection events={[]} year={2026} month0={6}
      onMonthChange={onMonthChange} onAdd={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 7)
    await userEvent.click(screen.getByRole('button', { name: '이전 달' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 5)
  })
  it('wraps the year when navigating from December', async () => {
    const onMonthChange = vi.fn()
    render(<ScheduleSection events={[]} year={2026} month0={11}
      onMonthChange={onMonthChange} onAdd={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(onMonthChange).toHaveBeenCalledWith(2027, 0)
  })
  it('submits a new event', async () => {
    const onAdd = vi.fn()
    render(<ScheduleSection events={[]} year={2026} month0={6}
      onMonthChange={vi.fn()} onAdd={onAdd} onDelete={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('일정 제목'), '수술 참관')
    await userEvent.type(screen.getByLabelText('날짜'), '2026-07-22')
    await userEvent.type(screen.getByLabelText('시간'), '08:30')
    await userEvent.selectOptions(screen.getByLabelText('종류'), 'surgery')
    await userEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    expect(onAdd).toHaveBeenCalledWith({
      title: '수술 참관',
      starts_at: '2026-07-22T08:30:00+09:00',
      kind: 'surgery',
    })
  })
  it('deletes an event', async () => {
    const onDelete = vi.fn()
    render(<ScheduleSection events={events} year={2026} month0={6}
      onMonthChange={vi.fn()} onAdd={vi.fn()} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: '일정 삭제' }))
    expect(onDelete).toHaveBeenCalledWith('e1')
  })
})
```

- [ ] **Step 2: Run to verify FAIL**, then create `src/components/sections/ScheduleSection.tsx`

```tsx
import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { LiquidGlass } from '../LiquidGlass'
import { monthGrid } from '../../lib/calendar'
import { EVENT_KINDS, type EventItem, type EventKind } from '../../lib/events'

const KIND_DOT: Record<EventKind, string> = {
  conference: '#6FFF00',
  surgery: '#ff6b6b',
  social: '#ffd166',
  professor: '#4ecdc4',
  other: '#c792ea',
}

export function ScheduleSection({
  events,
  year,
  month0,
  onMonthChange,
  onAdd,
  onDelete,
}: {
  events: EventItem[]
  year: number
  month0: number
  onMonthChange: (year: number, month0: number) => void
  onAdd: (v: { title: string; starts_at: string; kind: EventKind }) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [kind, setKind] = useState<EventKind>('other')

  const cells = monthGrid(year, month0)
  const byDate = new Map<string, EventItem[]>()
  for (const e of events) {
    const d = e.starts_at.slice(0, 10)
    byDate.set(d, [...(byDate.get(d) ?? []), e])
  }

  const prev = () => (month0 === 0 ? onMonthChange(year - 1, 11) : onMonthChange(year, month0 - 1))
  const next = () => (month0 === 11 ? onMonthChange(year + 1, 0) : onMonthChange(year, month0 + 1))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date || !time) return
    onAdd({ title: title.trim(), starts_at: `${date}T${time}:00+09:00`, kind })
    setTitle(''); setDate(''); setTime(''); setKind('other')
  }

  return (
    <LiquidGlass className="rounded-[24px]">
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-grotesk text-2xl uppercase">스케줄</h3>
          <div className="flex items-center gap-3">
            <button aria-label="이전 달" onClick={prev}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10">
              <ArrowLeft size={14} />
            </button>
            <span className="font-grotesk text-sm uppercase">{year}년 {month0 + 1}월</span>
            <button aria-label="다음 달" onClick={next}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10">
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7 gap-1 font-mono text-[10px] uppercase text-cream/50">
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
            <div key={d} className="px-1 py-0.5 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            const dayEvents = byDate.get(c.date) ?? []
            return (
              <div key={c.date}
                className={`min-h-[52px] rounded-md p-1 font-mono text-[11px] ${c.inMonth ? 'bg-white/5 text-cream' : 'bg-transparent text-cream/25'}`}>
                <div>{Number(c.date.slice(8, 10))}</div>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {dayEvents.map((e) => (
                    <span key={e.id} title={e.title}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: KIND_DOT[e.kind] }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Month event list */}
        <ul className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
              <span className="h-2 w-2 rounded-full" style={{ background: KIND_DOT[e.kind] }} />
              <span className="font-mono text-[10px] uppercase text-cream/60">
                {e.starts_at.slice(5, 10)} {e.starts_at.slice(11, 16)}
              </span>
              <span className="flex-1 font-mono text-sm">{e.title}</span>
              <span className="font-mono text-[10px] uppercase text-cream/50">{EVENT_KINDS[e.kind]}</span>
              <button aria-label="일정 삭제" onClick={() => onDelete(e.id)}
                className="font-mono text-[10px] uppercase text-cream/40 transition hover:text-red-400">
                삭제
              </button>
            </li>
          ))}
          {events.length === 0 && (
            <li className="font-mono text-xs uppercase text-cream/40">이 달의 일정이 없습니다</li>
          )}
        </ul>

        {/* Add form */}
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 min-w-[160px] flex-col gap-1 font-mono text-[10px] uppercase text-cream/60">
            일정 제목
            <input aria-label="일정 제목" value={title} onChange={(e) => setTitle(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-cream/60">
            날짜
            <input aria-label="날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-cream/60">
            시간
            <input aria-label="시간" type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
          </label>
          <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-cream/60">
            종류
            <select aria-label="종류" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon [&>option]:bg-bg">
              {Object.entries(EVENT_KINDS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
            일정 추가
          </button>
        </form>
      </div>
    </LiquidGlass>
  )
}
```

- [ ] **Step 3: Run to verify PASS (5 tests), commit**

```bash
git add -A
git commit -m "feat(sections): ScheduleSection with month grid and event form"
```

---

### Task 6: HomeSections composition + App wiring

**Files:**
- Create: `src/home/HomeSections.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/components/Hero.tsx` (nav)

- [ ] **Step 1: Create `src/home/HomeSections.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'
import { listTodos, addTodo, setTodoDone, deleteTodo, type Todo } from '../lib/todos'
import { listEventsInRange, addEvent, deleteEvent, type EventItem, type EventKind } from '../lib/events'
import { monthRangeISO } from '../lib/calendar'
import { recordXpEvent } from '../mascot/mascot'
import { TodoSection } from '../components/sections/TodoSection'
import { ScheduleSection } from '../components/sections/ScheduleSection'

/**
 * Home scroll sections below the hero. Section 2 (todos + schedule) is live;
 * sections 3 (team) and 4 (papers) are anchored placeholders for later slices.
 */
export function HomeSections({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (p: Profile) => void
}) {
  const now = new Date()
  const [todos, setTodos] = useState<Todo[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [year, setYear] = useState(now.getFullYear())
  const [month0, setMonth0] = useState(now.getMonth())
  const userId = profile.id

  useEffect(() => {
    let active = true
    listTodos(supabase, userId)
      .then((t) => { if (active) setTodos(t) })
      .catch(console.error)
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    let active = true
    const { start, end } = monthRangeISO(year, month0)
    listEventsInRange(supabase, userId, start, end)
      .then((e) => { if (active) setEvents(e) })
      .catch(console.error)
    return () => { active = false }
  }, [userId, year, month0])

  const handleAddTodo = async (title: string) => {
    try {
      const t = await addTodo(supabase, userId, title, null)
      setTodos((s) => [t, ...s])
    } catch (e) { console.error(e) }
  }

  const handleToggleTodo = async (todo: Todo) => {
    try {
      const nowDone = !todo.done
      // First-ever completion grants schedule_done XP once (xp_granted latch).
      const grantXp = nowDone && !todo.xp_granted
      const updated = await setTodoDone(supabase, todo.id, nowDone, todo.xp_granted || grantXp)
      setTodos((s) => s.map((t) => (t.id === todo.id ? updated : t)))
      if (grantXp) {
        const p = await recordXpEvent(supabase, profile, 'schedule_done')
        onProfileChange(p)
      }
    } catch (e) { console.error(e) }
  }

  const handleDeleteTodo = async (id: string) => {
    try {
      await deleteTodo(supabase, id)
      setTodos((s) => s.filter((t) => t.id !== id))
    } catch (e) { console.error(e) }
  }

  const handleAddEvent = async (v: { title: string; starts_at: string; kind: EventKind }) => {
    try {
      const e = await addEvent(supabase, userId, v)
      const { start, end } = monthRangeISO(year, month0)
      if (e.starts_at >= start && e.starts_at.slice(0, 10) < end) {
        setEvents((s) => [...s, e].sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
      }
    } catch (e) { console.error(e) }
  }

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteEvent(supabase, id)
      setEvents((s) => s.filter((e) => e.id !== id))
    } catch (e) { console.error(e) }
  }

  const handleMonthChange = (y: number, m0: number) => { setYear(y); setMonth0(m0) }

  return (
    <div className="mx-auto flex max-w-[1831px] flex-col gap-16 px-6 py-16 sm:px-10">
      {/* Section 2: todos + schedule */}
      <section id="schedule" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          오늘의 <span className="font-condiment normal-case text-neon">plan</span>
        </h2>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
          <TodoSection todos={todos} onAdd={handleAddTodo} onToggle={handleToggleTodo} onDelete={handleDeleteTodo} />
          <ScheduleSection events={events} year={year} month0={month0}
            onMonthChange={handleMonthChange} onAdd={handleAddEvent} onDelete={handleDeleteEvent} />
        </div>
      </section>

      {/* Section 3 placeholder: team missions + conference calendar */}
      <section id="team" className="scroll-mt-8">
        <h2 className="mb-4 font-grotesk text-3xl uppercase sm:text-5xl">
          팀 <span className="font-condiment normal-case text-neon">missions</span>
        </h2>
        <p className="font-mono text-sm uppercase text-cream/40">곧 제공 — 1–4년차·교수님 공유 할일판과 학회 캘린더가 여기에 들어옵니다.</p>
      </section>

      {/* Section 4 placeholder: papers */}
      <section id="papers" className="scroll-mt-8">
        <h2 className="mb-4 font-grotesk text-3xl uppercase sm:text-5xl">
          논문 <span className="font-condiment normal-case text-neon">breakdown</span>
        </h2>
        <p className="font-mono text-sm uppercase text-cream/40">곧 제공 — 전공 최신 논문 수집과 AI 분석 리포트가 여기에 들어옵니다.</p>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `src/App.tsx`** — add import `import { HomeSections } from './home/HomeSections'` and change the final return to:

```tsx
  return (
    <>
      <TextureOverlay />
      <Hero profile={profile!} mascot={mascot} onSignOut={signOut} />
      <HomeSections profile={profile!} onProfileChange={setProfile} />
    </>
  )
```

- [ ] **Step 3: Isolate App gating tests** — in `src/App.test.tsx` add alongside the other mocks:

```tsx
vi.mock('./home/HomeSections', () => ({ HomeSections: () => null }))
```

- [ ] **Step 4: Activate the 캘린더 nav tab in `src/components/Hero.tsx`** — update the NAV config to give entries a `href` and make 캘린더 active, pointing at the section anchor:

```tsx
const NAV = [
  { label: '홈', href: '#', active: true },
  { label: '논문', href: '#papers', active: true },
  { label: '캘린더', href: '#schedule', active: true },
  { label: '메일', href: '#', active: false },
  { label: '설정', href: '#', active: true },
]
```

and in the nav render change `<a href="#"` to `<a href={n.href}`.

Update the Hero test nav assertion if needed — the existing test only checks the 논문 link exists, which still passes.

- [ ] **Step 5: Full gate**

Run: `npm test` → ALL PASS. `npx tsc -b --noEmit` → clean. `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(home): scroll sections — todos+schedule live, team/papers anchored"
```

---

### Task 7: Final verification + operator notes

- [ ] **Step 1:** `npm test && npx tsc -b --noEmit && npm run build` — all green.
- [ ] **Step 2:** `npm run dev` boots clean; stop. (No login.)
- [ ] **Step 3 (operator, manual):** apply `supabase/migrations/0003_todos_events.sql` in the SQL editor, then live-check: add/complete/delete a todo (first completion bumps XP by +8 and 큐비's bar moves), add/delete events, month navigation, nav 캘린더 → scrolls to section, reload persists all.
- [ ] **Step 4:** commit stragglers if any.

---

## Self-Review (completed by author)

**Spec coverage (Slice 3):** DB → Task 1; 할일 CRUD + XP latch → Tasks 2/3/4 + HomeSections toggle logic (Task 6); 월 달력+일정 폼 → Tasks 1/5; 홈 조립+앵커+자리표시 → Task 6; 테스트 → each task. ✓
**Placeholders:** none (team/papers placeholder sections are the *product's* intentional "곧 제공" state per spec, not plan gaps). ✓
**Type consistency:** `Todo`/`EventItem`/`EventKind` defined in Task 2 match Tasks 4/5/6; `recordXpEvent(client, profile, type)` (Task 3) matches Task 6 call; `monthGrid`/`monthRangeISO` (Task 1) match Tasks 5/6; `HomeSections({profile, onProfileChange})` matches App wiring. `setTodoDone(client, id, done, xpGranted)` signature consistent. ✓
