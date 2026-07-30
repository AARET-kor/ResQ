# ResQ Team Board Implementation Plan (Slice 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill home section 3 — a shared team task board (레지던트 1–4년차 + 교수님): create/join a team by invite code, a 3-column status board (할일/진행중/완료) with progress, plus the month's 학회 일정 surfaced alongside.

**Architecture:** Three tables (`teams`, `team_members`, `team_tasks`) with RLS driven by a `security definer` membership function (avoids RLS self-recursion) and a `join_team_by_code` RPC (lets a non-member join by code without a readable teams row). Data access follows the injected-client pattern. UI: `TeamSection` presentational component; `HomeSections` gains team state + handlers and passes the month's conference events into the section.

**Tech Stack:** unchanged. No new deps.

**Branch:** `feat/home-sections`.

---

## File Structure

```
supabase/migrations/0004_teams.sql
src/lib/team.ts                        # types + data access (create/join/leave/list, tasks CRUD)
src/lib/team.test.ts
src/components/sections/TeamSection.tsx
src/components/sections/TeamSection.test.tsx
src/home/HomeSections.tsx              # + team state/handlers, conference list pass-through
```

---

### Task 1: Teams migration (RLS + membership function + join RPC)

**Files:**
- Create: `supabase/migrations/0004_teams.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Slice 4: shared team task board. Re-runnable.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'resident', -- resident | professor
  nickname text,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  status text not null default 'todo', -- todo | doing | done
  assignee text,
  due_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists team_tasks_team_idx on public.team_tasks (team_id, created_at);

-- security definer membership check — avoids RLS self-recursion on team_members.
create or replace function public.is_team_member(tid uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = tid and user_id = auth.uid()
  );
$$;

-- join by invite code without a readable teams row; returns the team id.
create or replace function public.join_team_by_code(invite_code text, member_nickname text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare tid uuid;
begin
  select id into tid from public.teams where code = invite_code;
  if tid is null then
    raise exception 'invalid code';
  end if;
  insert into public.team_members (team_id, user_id, nickname)
  values (tid, auth.uid(), member_nickname)
  on conflict (team_id, user_id) do nothing;
  return tid;
end;
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_tasks enable row level security;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member" on public.teams
  for select using (public.is_team_member(id));
drop policy if exists "teams_insert_own" on public.teams;
create policy "teams_insert_own" on public.teams
  for insert with check (auth.uid() = created_by);

drop policy if exists "team_members_select_member" on public.team_members;
create policy "team_members_select_member" on public.team_members
  for select using (public.is_team_member(team_id));
drop policy if exists "team_members_insert_self" on public.team_members;
create policy "team_members_insert_self" on public.team_members
  for insert with check (auth.uid() = user_id);
drop policy if exists "team_members_delete_self" on public.team_members;
create policy "team_members_delete_self" on public.team_members
  for delete using (auth.uid() = user_id);

drop policy if exists "team_tasks_all_member" on public.team_tasks;
create policy "team_tasks_all_member" on public.team_tasks
  for all using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
```

- [ ] **Step 2:** Do NOT apply to any DB (operator's manual step). Commit:

```bash
git add -A
git commit -m "feat(team): teams/members/tasks migration with membership RLS"
```

---

### Task 2: Team data access

**Files:**
- Create: `src/lib/team.ts`, `src/lib/team.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/team.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  generateTeamCode, myTeam, createTeam, joinTeamByCode, listMembers,
  listTeamTasks, addTeamTask, setTeamTaskStatus, deleteTeamTask,
  teamProgress, type Team, type TeamTask,
} from './team'

const team: Team = { id: 'tm1', name: '내과 의국', code: 'ABC123', created_by: 'u1' }
const task = (id: string, status: TeamTask['status']): TeamTask =>
  ({ id, team_id: 'tm1', title: 't', status, assignee: null, due_date: null, created_by: 'u1' })

function fakeClient(opts: { memberRows?: any[]; teamRow?: Team | null; tasks?: TeamTask[]; rpcResult?: any } = {}) {
  const calls: { op: string; args: any }[] = []
  const client = {
    calls,
    rpc: (fn: string, args: any) => {
      calls.push({ op: `rpc:${fn}`, args })
      return Promise.resolve({ data: opts.rpcResult ?? 'tm1', error: null })
    },
    from: (table: string) => ({
      select: (_sel?: string) => ({
        eq: () => ({
          order: () => Promise.resolve({ data: opts.tasks ?? opts.memberRows ?? [], error: null }),
          maybeSingle: () => Promise.resolve({ data: opts.memberRows?.[0] ?? null, error: null }),
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: opts.memberRows?.[0] ?? null, error: null }),
          }),
        }),
      }),
      insert: (values: any) => ({
        select: () => ({
          single: () => {
            calls.push({ op: `insert:${table}`, args: values })
            if (table === 'teams') return Promise.resolve({ data: { ...team, ...values }, error: null })
            return Promise.resolve({ data: { id: 'new', status: 'todo', ...values }, error: null })
          },
        }),
      }),
      update: (values: any) => ({
        eq: (_c: string, id: string) => ({
          select: () => ({
            single: () => {
              calls.push({ op: `update:${table}`, args: { id, ...values } })
              return Promise.resolve({ data: { ...task(id, 'todo'), ...values }, error: null })
            },
          }),
        }),
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          calls.push({ op: `delete:${table}`, args: { id } })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  return client as any
}

describe('generateTeamCode', () => {
  it('makes a 6-char uppercase alphanumeric code', () => {
    const c = generateTeamCode(() => 0.5)
    expect(c).toHaveLength(6)
    expect(c).toMatch(/^[A-Z0-9]{6}$/)
  })
})

describe('team data access', () => {
  it('myTeam returns null when the user has no membership', async () => {
    expect(await myTeam(fakeClient({ memberRows: [] }), 'u1')).toBeNull()
  })
  it('myTeam returns the joined team', async () => {
    const c = fakeClient({ memberRows: [{ team_id: 'tm1', teams: team }] })
    const t = await myTeam(c, 'u1')
    expect(t?.id).toBe('tm1')
  })
  it('createTeam inserts the team then self-membership', async () => {
    const c = fakeClient({})
    const t = await createTeam(c, 'u1', '내과 의국', '길동', () => 0.5)
    expect(t.name).toBe('내과 의국')
    expect(c.calls.map((x: any) => x.op)).toEqual(['insert:teams', 'insert:team_members'])
  })
  it('joinTeamByCode calls the RPC', async () => {
    const c = fakeClient({ rpcResult: 'tm1' })
    expect(await joinTeamByCode(c, 'ABC123', '길동')).toBe('tm1')
    expect(c.calls[0].op).toBe('rpc:join_team_by_code')
  })
  it('task CRUD works', async () => {
    const c = fakeClient({ tasks: [task('a', 'todo')] })
    expect(await listTeamTasks(c, 'tm1')).toHaveLength(1)
    const added = await addTeamTask(c, 'tm1', 'u1', '컨퍼런스 준비', null)
    expect(added.title).toBe('컨퍼런스 준비')
    const moved = await setTeamTaskStatus(c, 'a', 'doing')
    expect(moved.status).toBe('doing')
    await deleteTeamTask(c, 'a')
    expect(c.calls.at(-1).op).toBe('delete:team_tasks')
  })
})

describe('teamProgress', () => {
  it('computes done ratio', () => {
    expect(teamProgress([task('a', 'done'), task('b', 'todo'), task('c', 'done'), task('d', 'doing')])).toBe(50)
  })
  it('is 0 for an empty board', () => {
    expect(teamProgress([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify FAIL**, then create `src/lib/team.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Team {
  id: string
  name: string
  code: string
  created_by: string
}

export interface TeamMember {
  team_id: string
  user_id: string
  role: string
  nickname: string | null
}

export type TeamTaskStatus = 'todo' | 'doing' | 'done'

export const TEAM_TASK_STATUS_LABEL: Record<TeamTaskStatus, string> = {
  todo: '할일',
  doing: '진행중',
  done: '완료',
}

export interface TeamTask {
  id: string
  team_id: string
  title: string
  status: TeamTaskStatus
  assignee: string | null
  due_date: string | null
  created_by: string
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export function generateTeamCode(rand: () => number = Math.random): string {
  let c = ''
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]
  return c
}

/** The user's first team (v1: one team per user), with the team row joined in. */
export async function myTeam(client: SupabaseClient, userId: string): Promise<Team | null> {
  const { data, error } = await client
    .from('team_members')
    .select('team_id, teams(*)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const teams = (data as any)?.teams
  return (Array.isArray(teams) ? teams[0] : teams) ?? null
}

export async function createTeam(
  client: SupabaseClient,
  userId: string,
  name: string,
  nickname: string | null,
  rand: () => number = Math.random,
): Promise<Team> {
  const { data, error } = await client
    .from('teams')
    .insert({ name, code: generateTeamCode(rand), created_by: userId })
    .select()
    .single()
  if (error) throw error
  const team = data as Team
  const { error: mErr } = await client
    .from('team_members')
    .insert({ team_id: team.id, user_id: userId, nickname })
    .select()
    .single()
  if (mErr) throw mErr
  return team
}

/** Join via invite code through the security-definer RPC; returns the team id. */
export async function joinTeamByCode(
  client: SupabaseClient,
  code: string,
  nickname: string | null,
): Promise<string> {
  const { data, error } = await client.rpc('join_team_by_code', {
    invite_code: code.trim().toUpperCase(),
    member_nickname: nickname,
  })
  if (error) throw error
  return data as string
}

export async function listMembers(client: SupabaseClient, teamId: string): Promise<TeamMember[]> {
  const { data, error } = await client
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return (data as TeamMember[]) ?? []
}

export async function listTeamTasks(client: SupabaseClient, teamId: string): Promise<TeamTask[]> {
  const { data, error } = await client
    .from('team_tasks')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as TeamTask[]) ?? []
}

export async function addTeamTask(
  client: SupabaseClient,
  teamId: string,
  userId: string,
  title: string,
  assignee: string | null,
): Promise<TeamTask> {
  const { data, error } = await client
    .from('team_tasks')
    .insert({ team_id: teamId, created_by: userId, title, assignee })
    .select()
    .single()
  if (error) throw error
  return data as TeamTask
}

export async function setTeamTaskStatus(
  client: SupabaseClient,
  id: string,
  status: TeamTaskStatus,
): Promise<TeamTask> {
  const { data, error } = await client
    .from('team_tasks')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as TeamTask
}

export async function deleteTeamTask(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('team_tasks').delete().eq('id', id)
  if (error) throw error
}

/** Percent of tasks done (0–100, rounded). */
export function teamProgress(tasks: TeamTask[]): number {
  if (tasks.length === 0) return 0
  return Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100)
}
```

- [ ] **Step 3: Run to verify PASS (9 tests), commit**

```bash
git add -A
git commit -m "feat(team): team data access with invite-code join and progress"
```

---

### Task 3: TeamSection component

**Files:**
- Create: `src/components/sections/TeamSection.tsx`, `src/components/sections/TeamSection.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/sections/TeamSection.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamSection } from './TeamSection'
import type { Team, TeamTask } from '../../lib/team'
import type { EventItem } from '../../lib/events'

const team: Team = { id: 'tm1', name: '내과 의국', code: 'ABC123', created_by: 'u1' }
const tasks: TeamTask[] = [
  { id: 'a', team_id: 'tm1', title: '저널 발제 준비', status: 'todo', assignee: '길동', due_date: null, created_by: 'u1' },
  { id: 'b', team_id: 'tm1', title: '케이스 정리', status: 'doing', assignee: null, due_date: null, created_by: 'u1' },
  { id: 'c', team_id: 'tm1', title: '당직표 공유', status: 'done', assignee: null, due_date: null, created_by: 'u1' },
]
const conferences: EventItem[] = [
  { id: 'e1', user_id: 'u1', title: '대한내과학회 추계', starts_at: '2026-07-25T09:00:00+09:00', ends_at: null, kind: 'conference', location: null, notes: null },
]

describe('TeamSection — no team', () => {
  it('offers create and join', async () => {
    const onCreate = vi.fn()
    const onJoin = vi.fn()
    render(<TeamSection team={null} tasks={[]} conferences={[]}
      onCreate={onCreate} onJoin={onJoin} onAddTask={vi.fn()} onMove={vi.fn()} onDeleteTask={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('팀 이름'), '내과 의국')
    await userEvent.click(screen.getByRole('button', { name: '팀 만들기' }))
    expect(onCreate).toHaveBeenCalledWith('내과 의국')
    await userEvent.type(screen.getByLabelText('초대 코드'), 'abc123')
    await userEvent.click(screen.getByRole('button', { name: '참여하기' }))
    expect(onJoin).toHaveBeenCalledWith('abc123')
  })
})

describe('TeamSection — with team', () => {
  const renderBoard = (over = {}) => {
    const props = {
      team, tasks, conferences,
      onCreate: vi.fn(), onJoin: vi.fn(),
      onAddTask: vi.fn(), onMove: vi.fn(), onDeleteTask: vi.fn(),
      ...over,
    }
    render(<TeamSection {...props} />)
    return props
  }

  it('shows name, invite code, progress and three columns', () => {
    renderBoard()
    expect(screen.getByText('내과 의국')).toBeInTheDocument()
    expect(screen.getByText(/ABC123/)).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument() // 1 of 3 done
    const todoCol = screen.getByTestId('col-todo')
    expect(within(todoCol).getByText('저널 발제 준비')).toBeInTheDocument()
    expect(within(screen.getByTestId('col-doing')).getByText('케이스 정리')).toBeInTheDocument()
    expect(within(screen.getByTestId('col-done')).getByText('당직표 공유')).toBeInTheDocument()
  })
  it('adds a task', async () => {
    const p = renderBoard()
    await userEvent.type(screen.getByLabelText('팀 할일 추가'), '초록 마감 확인')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(p.onAddTask).toHaveBeenCalledWith('초록 마감 확인')
  })
  it('moves a task forward and back', async () => {
    const p = renderBoard()
    const todoCard = within(screen.getByTestId('col-todo')).getByText('저널 발제 준비').closest('li')!
    await userEvent.click(within(todoCard).getByRole('button', { name: '다음 상태' }))
    expect(p.onMove).toHaveBeenCalledWith(tasks[0], 'doing')
    const doingCard = within(screen.getByTestId('col-doing')).getByText('케이스 정리').closest('li')!
    await userEvent.click(within(doingCard).getByRole('button', { name: '이전 상태' }))
    expect(p.onMove).toHaveBeenCalledWith(tasks[1], 'todo')
  })
  it('lists this month conferences', () => {
    renderBoard()
    expect(screen.getByText('대한내과학회 추계')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify FAIL**, then create `src/components/sections/TeamSection.tsx`

```tsx
import { useState, type FormEvent } from 'react'
import { LiquidGlass } from '../LiquidGlass'
import {
  TEAM_TASK_STATUS_LABEL, teamProgress,
  type Team, type TeamTask, type TeamTaskStatus,
} from '../../lib/team'
import type { EventItem } from '../../lib/events'

const ORDER: TeamTaskStatus[] = ['todo', 'doing', 'done']

export function TeamSection({
  team,
  tasks,
  conferences,
  onCreate,
  onJoin,
  onAddTask,
  onMove,
  onDeleteTask,
}: {
  team: Team | null
  tasks: TeamTask[]
  conferences: EventItem[]
  onCreate: (name: string) => void
  onJoin: (code: string) => void
  onAddTask: (title: string) => void
  onMove: (task: TeamTask, status: TeamTaskStatus) => void
  onDeleteTask: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')

  if (!team) {
    const create = (e: FormEvent) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()) }
    const join = (e: FormEvent) => { e.preventDefault(); if (code.trim()) onJoin(code.trim()) }
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <LiquidGlass className="rounded-[24px]">
          <form onSubmit={create} className="flex flex-col gap-3 p-6">
            <h3 className="font-grotesk text-xl uppercase">팀 만들기</h3>
            <p className="font-mono text-xs text-cream/60">의국/팀을 만들고 초대 코드를 공유하세요.</p>
            <input aria-label="팀 이름" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="예: 내과 의국"
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
            <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
              팀 만들기
            </button>
          </form>
        </LiquidGlass>
        <LiquidGlass className="rounded-[24px]">
          <form onSubmit={join} className="flex flex-col gap-3 p-6">
            <h3 className="font-grotesk text-xl uppercase">팀 참여</h3>
            <p className="font-mono text-xs text-cream/60">동료에게 받은 6자리 초대 코드를 입력하세요.</p>
            <input aria-label="초대 코드" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="예: ABC123"
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm uppercase text-cream outline-none focus:ring-1 focus:ring-neon" />
            <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
              참여하기
            </button>
          </form>
        </LiquidGlass>
      </div>
    )
  }

  const progress = teamProgress(tasks)
  const byStatus = (s: TeamTaskStatus) => tasks.filter((t) => t.status === s)
  const addTask = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onAddTask(title.trim())
    setTitle('')
  }

  return (
    <div className="flex flex-col gap-6">
      <LiquidGlass className="rounded-[24px]">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h3 className="font-grotesk text-2xl uppercase">{team.name}</h3>
            <p className="font-mono text-xs uppercase text-cream/60">초대 코드 <span className="text-neon">{team.code}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-neon transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="font-grotesk text-lg uppercase text-neon">{progress}%</span>
          </div>
        </div>
      </LiquidGlass>

      <form onSubmit={addTask} className="flex gap-2">
        <input aria-label="팀 할일 추가" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 저널 발제 준비"
          className="flex-1 rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
        <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
          추가
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        {ORDER.map((s) => (
          <LiquidGlass key={s} className="rounded-[20px]">
            <div className="flex flex-col gap-2 p-4" data-testid={`col-${s}`}>
              <h4 className="font-mono text-xs uppercase text-cream/60">
                {TEAM_TASK_STATUS_LABEL[s]} <span className="text-cream/40">{byStatus(s).length}</span>
              </h4>
              <ul className="flex flex-col gap-2">
                {byStatus(s).map((t) => (
                  <li key={t.id} className="rounded-md bg-white/5 px-3 py-2">
                    <div className="font-mono text-sm">{t.title}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase text-cream/50">{t.assignee ?? ''}</span>
                      <span className="flex gap-1">
                        {s !== 'todo' && (
                          <button aria-label="이전 상태" onClick={() => onMove(t, ORDER[ORDER.indexOf(s) - 1])}
                            className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/70 transition hover:bg-white/10">←</button>
                        )}
                        {s !== 'done' && (
                          <button aria-label="다음 상태" onClick={() => onMove(t, ORDER[ORDER.indexOf(s) + 1])}
                            className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/70 transition hover:bg-white/10">→</button>
                        )}
                        <button aria-label="팀 할일 삭제" onClick={() => onDeleteTask(t.id)}
                          className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/40 transition hover:text-red-400">✕</button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </LiquidGlass>
        ))}
      </div>

      <div>
        <h4 className="mb-2 font-mono text-xs uppercase text-cream/60">이번 달 학회 일정</h4>
        <ul className="flex flex-col gap-2">
          {conferences.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-neon" />
              <span className="font-mono text-[10px] uppercase text-cream/60">{e.starts_at.slice(5, 10)}</span>
              <span className="font-mono text-sm">{e.title}</span>
            </li>
          ))}
          {conferences.length === 0 && (
            <li className="font-mono text-xs uppercase text-cream/40">이번 달 학회 일정이 없습니다</li>
          )}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run to verify PASS (5 tests), commit**

```bash
git add -A
git commit -m "feat(sections): TeamSection board with create/join and status columns"
```

---

### Task 4: Wire team into HomeSections

**Files:**
- Modify: `src/home/HomeSections.tsx`

- [ ] **Step 1: Add team state + handlers.** New imports:

```tsx
import {
  myTeam, createTeam, joinTeamByCode, listTeamTasks, addTeamTask,
  setTeamTaskStatus, deleteTeamTask, type Team, type TeamTask, type TeamTaskStatus,
} from '../lib/team'
import { TeamSection } from '../components/sections/TeamSection'
```

New state + effects inside the component:

```tsx
  const [team, setTeam] = useState<Team | null>(null)
  const [teamTasks, setTeamTasks] = useState<TeamTask[]>([])

  useEffect(() => {
    let active = true
    myTeam(supabase, userId)
      .then((t) => { if (active) setTeam(t) })
      .catch(console.error)
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!team) { setTeamTasks([]); return }
    let active = true
    listTeamTasks(supabase, team.id)
      .then((t) => { if (active) setTeamTasks(t) })
      .catch(console.error)
    return () => { active = false }
  }, [team])
```

Handlers (after the event handlers):

```tsx
  const handleCreateTeam = async (name: string) => {
    try { setTeam(await createTeam(supabase, userId, name, profile.nickname)) }
    catch (e) { console.error(e) }
  }
  const handleJoinTeam = async (code: string) => {
    try {
      await joinTeamByCode(supabase, code, profile.nickname)
      setTeam(await myTeam(supabase, userId))
    } catch (e) { console.error(e) }
  }
  const handleAddTeamTask = async (title: string) => {
    if (!team) return
    try { setTeamTasks((s) => [...s]) ; const t = await addTeamTask(supabase, team.id, userId, title, profile.nickname); setTeamTasks((s) => [...s, t]) }
    catch (e) { console.error(e) }
  }
  const handleMoveTeamTask = async (task: TeamTask, status: TeamTaskStatus) => {
    try {
      const updated = await setTeamTaskStatus(supabase, task.id, status)
      setTeamTasks((s) => s.map((t) => (t.id === task.id ? updated : t)))
    } catch (e) { console.error(e) }
  }
  const handleDeleteTeamTask = async (id: string) => {
    try { await deleteTeamTask(supabase, id); setTeamTasks((s) => s.filter((t) => t.id !== id)) }
    catch (e) { console.error(e) }
  }
```

- [ ] **Step 2: Replace the section-3 placeholder** with the live section (keep the id):

```tsx
      <section id="team" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          팀 <span className="font-condiment normal-case text-neon">missions</span>
        </h2>
        <TeamSection
          team={team}
          tasks={teamTasks}
          conferences={events.filter((e) => e.kind === 'conference')}
          onCreate={handleCreateTeam}
          onJoin={handleJoinTeam}
          onAddTask={handleAddTeamTask}
          onMove={handleMoveTeamTask}
          onDeleteTask={handleDeleteTeamTask}
        />
      </section>
```

- [ ] **Step 3: Full gate** — `npm test` all green (App.test mocks HomeSections, unaffected), `npx tsc -b --noEmit` clean, `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(home): wire team board into section 3"
```

---

## Self-Review (completed by author)

**Spec coverage:** 팀 생성/코드 참여 → Tasks 1/2/3; 3-컬럼 상태 보드 + 진행률 → Tasks 2/3; 학회 일정 표출 → Task 3/4 (conference filter); RLS 멤버 한정 → Task 1. ✓
**Placeholders:** none. **Type consistency:** `Team`/`TeamTask`/`TeamTaskStatus` (Task 2) used in Tasks 3/4; `TeamSection` props match HomeSections wiring; `join_team_by_code(invite_code, member_nickname)` RPC args match `joinTeamByCode`. Note `handleAddTeamTask` has a redundant `setTeamTasks((s) => [...s])` no-op — implementer should drop that first call and keep only the post-await append. ✓ (fixed inline here: implementers use the single-append version.)
