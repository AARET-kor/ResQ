# ResQ Mascot Zone (Qbi/큐비) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **큐비 (Qbi)** — a cute-but-premium, randomly-assigned anthropomorphized-animal mascot — as the emotional anchor of the ResQ hero dashboard, growing along two axes (evolution stage = residency progress, level = activity XP), earning XP from daily logins.

**Architecture:** Pure, framework-free logic modules under `src/mascot/` (XP curve, stage-from-training, mood-from-activity, random species, state combiner) — all unit-tested with injected inputs. A thin data-access layer (`mascot.ts`) reuses the foundation's `upsertProfile` and an `xp_events` ledger. A presentational `MascotZone` component consumes a derived `MascotState`; a `useMascot` hook ensures species + records the daily login and feeds the component into the existing hero.

**Tech Stack:** Same as foundation — React 19 + TS + Vite + Tailwind v3 + Vitest + @testing-library/react + lucide-react (`ArrowLeft`/`ArrowRight`). **No new dependencies.** CSS transitions only.

**Prerequisite:** Foundation slice is live-verified. The operator has a live Supabase project + `.env.local`. Task 1's migration must be applied to that project (SQL editor) before the live E2E in Task 10.

**Locked design decisions (do not revisit):**
- One random species per user, fixed at hatch. **No** collection / re-roll / shop / props / economy this slice.
- Evolution **stage = residency progress (training %/PGY)**; **level = accumulated XP** — two separate axes.
- Only `daily_login` grants XP now. Define `read_paper` / `schedule_done` / `weekly_academic` as types but **do not emit** them.

---

## File Structure

```
supabase/migrations/0002_mascot.sql     # profiles cols + xp_events table + RLS
src/lib/profile.ts                       # MODIFY: add 4 optional mascot fields to Profile
src/mascot/
  roster.ts        # SPECIES roster (id/label/tint) + helpers  (config)
  events.ts        # XpEventType union + XP_AMOUNTS               (config)
  xp.ts            # level curve: xpToReachLevel / levelFromXp / levelProgress
  stage.ts         # Stage type + stageFromProgress(percent)
  mood.ts          # Mood type + moodFor(lastActiveOn, todayISO), daysInactive
  species.ts       # pickSpecies(rand)
  today.ts         # todayISO() / prevDayISO()  (impure boundary, tiny)
  state.ts         # MascotState + deriveMascotState(profile, todayISO)
  mascotAssets.ts  # placeholder art registry: mascotArt(speciesId, stage)
  mascot.ts        # data access: assignSpeciesIfMissing / recordDailyLogin
  useMascot.ts     # hook: ensure species + record login, return MascotState|null
src/components/
  MascotZone.tsx   # presentational mascot section (carousel + panel)
src/App.tsx        # MODIFY: render <MascotZone> under <Hero>
src/App.test.tsx   # MODIFY: mock useMascot so gating tests stay isolated
```

---

### Task 1: Migration + Profile type extension

**Files:**
- Create: `supabase/migrations/0002_mascot.sql`
- Modify: `src/lib/profile.ts`

- [ ] **Step 1: Write the migration `supabase/migrations/0002_mascot.sql`**

```sql
-- Mascot: extend profiles + an XP ledger. Additive/idempotent.
alter table public.profiles
  add column if not exists mascot_species text,
  add column if not exists mascot_name text,
  add column if not exists last_active_on date,
  add column if not exists streak_days integer not null default 0;

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

alter table public.xp_events enable row level security;

create policy "xp_events_select_own" on public.xp_events
  for select using (auth.uid() = user_id);
create policy "xp_events_insert_own" on public.xp_events
  for insert with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply it to the live Supabase project**

Paste into Supabase → SQL Editor → Run. Verify: `profiles` shows the 4 new columns and `xp_events` exists with RLS + 2 policies. (Deferred-but-required before Task 10's live check.)

- [ ] **Step 3: Extend the `Profile` type in `src/lib/profile.ts`**

Add these four **optional** fields to the `Profile` interface (keep everything else unchanged). Optional so existing test fixtures still compile:

```ts
  mascot_species?: string | null
  mascot_name?: string | null
  last_active_on?: string | null // ISO date
  streak_days?: number | null
```

- [ ] **Step 4: Verify existing suite still green**

Run: `npm test`
Expected: all existing tests PASS (type change is additive/optional), `npx tsc -b --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): xp_events + profile mascot columns migration and type"
```

---

### Task 2: Config — species roster + XP event types

**Files:**
- Create: `src/mascot/roster.ts`, `src/mascot/events.ts`, `src/mascot/roster.test.ts`

- [ ] **Step 1: Write the failing test `src/mascot/roster.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { SPECIES, SPECIES_IDS, speciesById } from './roster'
import { XP_AMOUNTS } from './events'

describe('roster', () => {
  it('has a non-empty roster with unique ids', () => {
    expect(SPECIES.length).toBeGreaterThan(1)
    expect(new Set(SPECIES_IDS).size).toBe(SPECIES_IDS.length)
  })
  it('looks species up by id', () => {
    expect(speciesById(SPECIES_IDS[0])?.id).toBe(SPECIES_IDS[0])
    expect(speciesById('nope')).toBeUndefined()
  })
})

describe('xp amounts', () => {
  it('defines an amount for every event type', () => {
    expect(XP_AMOUNTS.daily_login).toBe(10)
    expect(XP_AMOUNTS.read_paper).toBeGreaterThan(0)
    expect(XP_AMOUNTS.schedule_done).toBeGreaterThan(0)
    expect(XP_AMOUNTS.weekly_academic).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/roster.test.ts`
Expected: FAIL — cannot find module `./roster`.

- [ ] **Step 3: Create `src/mascot/roster.ts`**

```ts
export interface Species {
  id: string
  label: string // Korean animal name
  tint: string  // background tint hex
}

// Anthropomorphized hospital-animal roster (memes: 소/곰/알파카/개구리/햄스터/펭귄).
// Real art is swapped in later via mascotAssets; this is the source of truth for ids.
export const SPECIES: Species[] = [
  { id: 'cow', label: '소', tint: '#7c5cff' },
  { id: 'bear', label: '곰', tint: '#a16207' },
  { id: 'alpaca', label: '알파카', tint: '#ec4899' },
  { id: 'frog', label: '개구리', tint: '#22c55e' },
  { id: 'hamster', label: '햄스터', tint: '#f59e0b' },
  { id: 'penguin', label: '펭귄', tint: '#0ea5e9' },
]

export const SPECIES_IDS = SPECIES.map((s) => s.id)

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id)
}
```

- [ ] **Step 4: Create `src/mascot/events.ts`**

```ts
// All XP event types. Only `daily_login` is emitted this slice; the rest are
// reserved for future feature slices (papers, calendar) and must not fire yet.
export type XpEventType = 'daily_login' | 'read_paper' | 'schedule_done' | 'weekly_academic'

export const XP_AMOUNTS: Record<XpEventType, number> = {
  daily_login: 10,
  read_paper: 20,
  schedule_done: 8,
  weekly_academic: 30,
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/mascot/roster.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(mascot): species roster and xp event config"
```

---

### Task 3: XP level curve

**Files:**
- Create: `src/mascot/xp.ts`, `src/mascot/xp.test.ts`

- [ ] **Step 1: Write the failing test `src/mascot/xp.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { xpToReachLevel, levelFromXp, levelProgress } from './xp'

describe('xp curve', () => {
  it('thresholds are 100 * triangular(level-1)', () => {
    expect(xpToReachLevel(1)).toBe(0)
    expect(xpToReachLevel(2)).toBe(100)
    expect(xpToReachLevel(3)).toBe(300)
    expect(xpToReachLevel(4)).toBe(600)
  })
  it('levelFromXp picks the highest reached level', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(99)).toBe(1)
    expect(levelFromXp(100)).toBe(2)
    expect(levelFromXp(299)).toBe(2)
    expect(levelFromXp(300)).toBe(3)
  })
  it('levelProgress reports xp within the current level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpInLevel: 0, xpForLevel: 100 })
    expect(levelProgress(150)).toEqual({ level: 2, xpInLevel: 50, xpForLevel: 200 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/xp.test.ts`
Expected: FAIL — cannot find module `./xp`.

- [ ] **Step 3: Create `src/mascot/xp.ts`**

```ts
export interface LevelProgress {
  level: number
  xpInLevel: number
  xpForLevel: number
}

/** Cumulative XP required to REACH `level` (level 1 = 0). Curve: 100 * triangular(level-1). */
export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0
  const n = level - 1
  return (100 * (n * (n + 1))) / 2
}

/** Highest level whose threshold is <= totalXp. */
export function levelFromXp(totalXp: number): number {
  let level = 1
  while (xpToReachLevel(level + 1) <= totalXp) level++
  return level
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromXp(totalXp)
  const base = xpToReachLevel(level)
  const next = xpToReachLevel(level + 1)
  return { level, xpInLevel: totalXp - base, xpForLevel: next - base }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/mascot/xp.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): XP level curve"
```

---

### Task 4: Stage (from training) + Mood (from activity)

**Files:**
- Create: `src/mascot/stage.ts`, `src/mascot/mood.ts`, `src/mascot/stage.test.ts`, `src/mascot/mood.test.ts`

- [ ] **Step 1: Write failing test `src/mascot/stage.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { stageFromProgress } from './stage'

describe('stageFromProgress', () => {
  it('maps training-progress percent to a career stage', () => {
    expect(stageFromProgress(0)).toBe('INTERN')
    expect(stageFromProgress(24.9)).toBe('INTERN')
    expect(stageFromProgress(25)).toBe('JUNIOR')
    expect(stageFromProgress(49)).toBe('JUNIOR')
    expect(stageFromProgress(50)).toBe('SENIOR')
    expect(stageFromProgress(74)).toBe('SENIOR')
    expect(stageFromProgress(75)).toBe('CHIEF')
    expect(stageFromProgress(100)).toBe('CHIEF')
  })
})
```

- [ ] **Step 2: Write failing test `src/mascot/mood.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { moodFor, daysInactive } from './mood'

const today = '2026-07-14'

describe('mood', () => {
  it('counts whole days since last active', () => {
    expect(daysInactive('2026-07-14', today)).toBe(0)
    expect(daysInactive('2026-07-12', today)).toBe(2)
    expect(daysInactive(null, today)).toBeNull()
  })
  it('derives mood from inactivity', () => {
    expect(moodFor('2026-07-14', today)).toBe('ENERGIZED')
    expect(moodFor('2026-07-13', today)).toBe('NORMAL')
    expect(moodFor('2026-07-12', today)).toBe('TIRED')
    expect(moodFor('2026-07-11', today)).toBe('TIRED')
    expect(moodFor('2026-07-10', today)).toBe('ASLEEP')
    expect(moodFor(null, today)).toBe('NORMAL')
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm test -- src/mascot/stage.test.ts src/mascot/mood.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create `src/mascot/stage.ts`**

```ts
export type Stage = 'INTERN' | 'JUNIOR' | 'SENIOR' | 'CHIEF'

/** Evolution stage from residency training progress (percent 0..100). */
export function stageFromProgress(percent: number): Stage {
  if (percent < 25) return 'INTERN'
  if (percent < 50) return 'JUNIOR'
  if (percent < 75) return 'SENIOR'
  return 'CHIEF'
}
```

- [ ] **Step 5: Create `src/mascot/mood.ts`**

```ts
export type Mood = 'ENERGIZED' | 'NORMAL' | 'TIRED' | 'ASLEEP'

const MS_PER_DAY = 86_400_000

/** Whole days between an ISO date and today; null if never active. */
export function daysInactive(lastActiveOn: string | null | undefined, todayISO: string): number | null {
  if (!lastActiveOn) return null
  const last = new Date(lastActiveOn).getTime()
  const today = new Date(todayISO).getTime()
  return Math.floor((today - last) / MS_PER_DAY)
}

export function moodFor(lastActiveOn: string | null | undefined, todayISO: string): Mood {
  const days = daysInactive(lastActiveOn, todayISO)
  if (days === null) return 'NORMAL'
  if (days <= 0) return 'ENERGIZED'
  if (days === 1) return 'NORMAL'
  if (days <= 3) return 'TIRED'
  return 'ASLEEP'
}
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `npm test -- src/mascot/stage.test.ts src/mascot/mood.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mascot): stage-from-training and mood-from-activity"
```

---

### Task 5: Random species pick

**Files:**
- Create: `src/mascot/species.ts`, `src/mascot/species.test.ts`

- [ ] **Step 1: Write the failing test `src/mascot/species.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { pickSpecies } from './species'
import { SPECIES_IDS } from './roster'

describe('pickSpecies', () => {
  it('maps a [0,1) random into a roster id', () => {
    expect(pickSpecies(0)).toBe(SPECIES_IDS[0])
    expect(pickSpecies(0.999)).toBe(SPECIES_IDS[SPECIES_IDS.length - 1])
  })
  it('always returns a valid roster id', () => {
    for (const r of [0, 0.1, 0.33, 0.5, 0.8, 0.9999]) {
      expect(SPECIES_IDS).toContain(pickSpecies(r))
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/species.test.ts`
Expected: FAIL — cannot find module `./species`.

- [ ] **Step 3: Create `src/mascot/species.ts`**

```ts
import { SPECIES_IDS } from './roster'

/** Deterministic given `rand` in [0,1) — inject Math.random() at the call site for real use. */
export function pickSpecies(rand: number): string {
  const i = Math.min(SPECIES_IDS.length - 1, Math.floor(rand * SPECIES_IDS.length))
  return SPECIES_IDS[i]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/mascot/species.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): random species pick"
```

---

### Task 6: State combiner + date helpers

**Files:**
- Create: `src/mascot/today.ts`, `src/mascot/state.ts`, `src/mascot/state.test.ts`

- [ ] **Step 1: Write the failing test `src/mascot/state.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { deriveMascotState } from './state'
import type { Profile } from '../lib/profile'

const base: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 150, mascot_level: 1, mascot_stage: 1,
  mascot_species: 'frog', mascot_name: null, last_active_on: '2026-07-14', streak_days: 3,
}

describe('deriveMascotState', () => {
  it('combines species, level, stage, mood and defaults the name to 큐비', () => {
    const s = deriveMascotState(base, '2026-07-14')
    expect(s.speciesId).toBe('frog')
    expect(s.speciesLabel).toBe('개구리')
    expect(s.name).toBe('큐비')
    expect(s.level).toBe(2)
    expect(s.xpInLevel).toBe(50)
    expect(s.xpForLevel).toBe(200)
    expect(s.stage).toBe('SENIOR') // ~59% through 2024-03 .. 2028-02
    expect(s.mood).toBe('ENERGIZED')
    expect(s.streakDays).toBe(3)
  })
  it('uses a custom mascot name when set', () => {
    const s = deriveMascotState({ ...base, mascot_name: '몽이' }, '2026-07-14')
    expect(s.name).toBe('몽이')
  })
  it('falls back to the first species if the stored id is unknown', () => {
    const s = deriveMascotState({ ...base, mascot_species: 'ghost' }, '2026-07-14')
    expect(s.speciesId).toBe('cow')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/state.test.ts`
Expected: FAIL — cannot find module `./state`.

- [ ] **Step 3: Create `src/mascot/today.ts`**

```ts
/** Local calendar date as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** The ISO date one day before the given ISO date. */
export function prevDayISO(iso: string): string {
  const t = new Date(iso).getTime() - 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Create `src/mascot/state.ts`**

```ts
import { levelProgress } from './xp'
import { stageFromProgress, type Stage } from './stage'
import { moodFor, type Mood } from './mood'
import { SPECIES, speciesById } from './roster'
import { computeDday } from '../lib/dday'
import type { Profile } from '../lib/profile'

export const DEFAULT_MASCOT_NAME = '큐비'

export interface MascotState {
  speciesId: string
  speciesLabel: string
  tint: string
  name: string
  stage: Stage
  mood: Mood
  level: number
  xpInLevel: number
  xpForLevel: number
  streakDays: number
}

export function deriveMascotState(profile: Profile, todayISO: string): MascotState {
  const species = speciesById(profile.mascot_species ?? '') ?? SPECIES[0]
  const { percent } = computeDday(
    new Date(profile.training_start ?? todayISO),
    new Date(profile.training_end ?? todayISO),
    new Date(todayISO),
  )
  const { level, xpInLevel, xpForLevel } = levelProgress(profile.xp ?? 0)
  return {
    speciesId: species.id,
    speciesLabel: species.label,
    tint: species.tint,
    name: profile.mascot_name || DEFAULT_MASCOT_NAME,
    stage: stageFromProgress(percent),
    mood: moodFor(profile.last_active_on, todayISO),
    level,
    xpInLevel,
    xpForLevel,
    streakDays: profile.streak_days ?? 0,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/mascot/state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(mascot): mascot state combiner + date helpers"
```

---

### Task 7: Placeholder art registry

**Files:**
- Create: `src/mascot/mascotAssets.ts`, `src/mascot/mascotAssets.test.ts`

- [ ] **Step 1: Write the failing test `src/mascot/mascotAssets.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mascotArt } from './mascotAssets'
import { SPECIES_IDS } from './roster'

describe('mascotArt', () => {
  it('returns a non-empty glyph for every species', () => {
    for (const id of SPECIES_IDS) {
      expect(mascotArt(id, 'INTERN')).toBeTruthy()
    }
  })
  it('falls back for an unknown species', () => {
    expect(mascotArt('nope', 'CHIEF')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/mascotAssets.test.ts`
Expected: FAIL — cannot find module `./mascotAssets`.

- [ ] **Step 3: Create `src/mascot/mascotAssets.ts`**

```ts
import type { Stage } from './stage'

// Placeholder glyphs until real premium line-art is produced. Keep this the ONLY
// place art is resolved so swapping emoji → <img src> later is a one-file change.
const GLYPH: Record<string, string> = {
  cow: '🐮',
  bear: '🐻',
  alpaca: '🦙',
  frog: '🐸',
  hamster: '🐹',
  penguin: '🐧',
}

// `stage` is accepted now so the future art registry can vary art per stage
// without changing callers. The placeholder ignores it intentionally.
export function mascotArt(speciesId: string, _stage: Stage): string {
  return GLYPH[speciesId] ?? '🐣'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/mascot/mascotAssets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): placeholder art registry"
```

---

### Task 8: Data access — assign species + record daily login

**Files:**
- Create: `src/mascot/mascot.ts`, `src/mascot/mascot.test.ts`

- [ ] **Step 1: Write the failing test `src/mascot/mascot.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { assignSpeciesIfMissing, recordDailyLogin } from './mascot'
import type { Profile } from '../lib/profile'

function fakeClient(row: Profile) {
  const inserts: { table: string; values: any }[] = []
  const client = {
    inserts,
    from: (table: string) => ({
      upsert: (values: any) => ({
        select: () => ({ single: () => Promise.resolve({ data: { ...row, ...values }, error: null }) }),
      }),
      insert: (values: any) => {
        inserts.push({ table, values })
        return Promise.resolve({ error: null })
      },
    }),
  }
  return client as any
}

const base: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 40, mascot_level: 1, mascot_stage: 1,
  mascot_species: null, mascot_name: null, last_active_on: null, streak_days: 0,
}

describe('assignSpeciesIfMissing', () => {
  it('assigns a species when none is set', async () => {
    const p = await assignSpeciesIfMissing(fakeClient(base), base, 0)
    expect(p.mascot_species).toBeTruthy()
  })
  it('leaves an existing species untouched', async () => {
    const withSpecies = { ...base, mascot_species: 'bear' }
    const p = await assignSpeciesIfMissing(fakeClient(withSpecies), withSpecies, 0.99)
    expect(p.mascot_species).toBe('bear')
  })
})

describe('recordDailyLogin', () => {
  it('grants +10 XP and records the event on a new day', async () => {
    const client = fakeClient(base)
    const p = await recordDailyLogin(client, base, '2026-07-14')
    expect(p.xp).toBe(50)
    expect(p.last_active_on).toBe('2026-07-14')
    expect(p.streak_days).toBe(1)
    expect(client.inserts).toEqual([
      { table: 'xp_events', values: { user_id: 'u1', type: 'daily_login', amount: 10 } },
    ])
  })
  it('increments the streak when the previous active day was yesterday', async () => {
    const yesterday = { ...base, last_active_on: '2026-07-13', streak_days: 4 }
    const p = await recordDailyLogin(fakeClient(yesterday), yesterday, '2026-07-14')
    expect(p.streak_days).toBe(5)
  })
  it('is a no-op when already logged in today', async () => {
    const todayRow = { ...base, last_active_on: '2026-07-14', xp: 70 }
    const client = fakeClient(todayRow)
    const p = await recordDailyLogin(client, todayRow, '2026-07-14')
    expect(p.xp).toBe(70)
    expect(client.inserts).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/mascot.test.ts`
Expected: FAIL — cannot find module `./mascot`.

- [ ] **Step 3: Create `src/mascot/mascot.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertProfile, type Profile } from '../lib/profile'
import { pickSpecies } from './species'
import { XP_AMOUNTS } from './events'
import { prevDayISO } from './today'

/** Assign a random species on first hatch; no-op if one already exists. */
export async function assignSpeciesIfMissing(
  client: SupabaseClient,
  profile: Profile,
  rand: number,
): Promise<Profile> {
  if (profile.mascot_species) return profile
  return upsertProfile(client, { id: profile.id, mascot_species: pickSpecies(rand) })
}

/** Grant daily-login XP once per calendar day; updates streak and appends to the ledger. */
export async function recordDailyLogin(
  client: SupabaseClient,
  profile: Profile,
  todayISO: string,
): Promise<Profile> {
  if (profile.last_active_on === todayISO) return profile
  const amount = XP_AMOUNTS.daily_login
  await client.from('xp_events').insert({ user_id: profile.id, type: 'daily_login', amount })
  const continued = profile.last_active_on === prevDayISO(todayISO)
  const streak = continued ? (profile.streak_days ?? 0) + 1 : 1
  return upsertProfile(client, {
    id: profile.id,
    xp: (profile.xp ?? 0) + amount,
    last_active_on: todayISO,
    streak_days: streak,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/mascot/mascot.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): data access — assign species + record daily login"
```

---

### Task 9: MascotZone component

**Files:**
- Create: `src/components/MascotZone.tsx`, `src/components/MascotZone.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/MascotZone.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MascotZone } from './MascotZone'
import type { MascotState } from '../mascot/state'

const state: MascotState = {
  speciesId: 'frog', speciesLabel: '개구리', tint: '#22c55e', name: '큐비',
  stage: 'SENIOR', mood: 'ENERGIZED', level: 2, xpInLevel: 50, xpForLevel: 200, streakDays: 3,
}

describe('MascotZone', () => {
  it('shows the mascot name, level, current stage and mood', () => {
    render(<MascotZone state={state} />)
    expect(screen.getByText(/큐비/)).toBeInTheDocument()
    expect(screen.getByText(/Lv\.\s*2/)).toBeInTheDocument()
    expect(screen.getByText('시니어 단계')).toBeInTheDocument()
    expect(screen.getByText('현재 시니어')).toBeInTheDocument()
    expect(screen.getByText(/쌩쌩/)).toBeInTheDocument()
  })
  it('previews other evolution stages with the arrows', async () => {
    render(<MascotZone state={state} />)
    await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    expect(screen.getByText('치프 단계')).toBeInTheDocument()
    // the actual stage indicator does not change
    expect(screen.getByText('현재 시니어')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/MascotZone.test.tsx`
Expected: FAIL — cannot find module `./MascotZone`.

- [ ] **Step 3: Create `src/components/MascotZone.tsx`**

```tsx
import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { LiquidGlass } from './LiquidGlass'
import { mascotArt } from '../mascot/mascotAssets'
import type { MascotState } from '../mascot/state'
import type { Stage } from '../mascot/stage'
import type { Mood } from '../mascot/mood'

const STAGES: Stage[] = ['INTERN', 'JUNIOR', 'SENIOR', 'CHIEF']
const STAGE_LABEL: Record<Stage, string> = { INTERN: '인턴', JUNIOR: '주니어', SENIOR: '시니어', CHIEF: '치프' }
const MOOD_LABEL: Record<Mood, string> = { ENERGIZED: '쌩쌩', NORMAL: '평온', TIRED: '지침', ASLEEP: '수면' }

export function MascotZone({ state }: { state: MascotState }) {
  const actualIndex = STAGES.indexOf(state.stage)
  const [preview, setPreview] = useState(actualIndex)
  const stage = STAGES[preview]
  const pct = state.xpForLevel > 0 ? Math.round((state.xpInLevel / state.xpForLevel) * 100) : 0

  return (
    <section
      className="relative mx-auto max-w-[1831px] overflow-hidden px-6 py-16 sm:px-10"
      style={{ background: `radial-gradient(120% 80% at 50% 120%, ${state.tint}55 0%, transparent 70%)` }}
    >
      {/* ghost level text */}
      <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
        <span className="select-none font-grotesk uppercase leading-none text-white/5" style={{ fontSize: 'clamp(80px, 20vw, 260px)' }}>
          Lv.{state.level}
        </span>
      </div>

      <div className="relative flex flex-col items-center gap-6">
        <div className="flex items-center gap-6">
          <button
            aria-label="이전 단계"
            onClick={() => setPreview((p) => (p + STAGES.length - 1) % STAGES.length)}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/40 text-cream transition hover:bg-white/10"
          >
            <ArrowLeft size={22} />
          </button>

          <div className="flex flex-col items-center">
            <div className="text-[96px] leading-none transition-transform duration-[650ms] sm:text-[140px]">
              {mascotArt(state.speciesId, stage)}
            </div>
            <p className="mt-2 font-mono text-xs uppercase text-cream/70">{STAGE_LABEL[stage]} 단계</p>
          </div>

          <button
            aria-label="다음 단계"
            onClick={() => setPreview((p) => (p + 1) % STAGES.length)}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/40 text-cream transition hover:bg-white/10"
          >
            <ArrowRight size={22} />
          </button>
        </div>

        <LiquidGlass className="w-full max-w-md rounded-[24px]">
          <div className="flex flex-col gap-3 p-6">
            <div className="flex items-baseline justify-between">
              <span className="font-grotesk text-2xl uppercase">{state.name}</span>
              <span className="font-grotesk text-xl uppercase text-neon">Lv. {state.level}</span>
            </div>
            <div>
              <div className="mb-1 flex justify-between font-mono text-[11px] uppercase text-cream/70">
                <span>XP</span>
                <span>{state.xpInLevel} / {state.xpForLevel}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-neon transition-[width] duration-[650ms]" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="flex justify-between font-mono text-xs uppercase text-cream/80">
              <span>현재 {STAGE_LABEL[state.stage]}</span>
              <span>기분 {MOOD_LABEL[state.mood]}</span>
              <span>{state.streakDays}일 연속</span>
            </div>
          </div>
        </LiquidGlass>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/MascotZone.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): MascotZone component with stage carousel"
```

---

### Task 10: useMascot hook + wire into the dashboard

**Files:**
- Create: `src/mascot/useMascot.ts`
- Modify: `src/App.tsx`, `src/App.test.tsx`

- [ ] **Step 1: Create `src/mascot/useMascot.ts`**

```tsx
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'
import { assignSpeciesIfMissing, recordDailyLogin } from './mascot'
import { deriveMascotState, type MascotState } from './state'
import { todayISO } from './today'

/**
 * Ensures the user has a hatched species and records the once-per-day login,
 * pushing the updated profile back up via onProfileChange. Returns the derived
 * MascotState for rendering (null until a species exists).
 */
export function useMascot(
  profile: Profile | null,
  onProfileChange: (p: Profile) => void,
): MascotState | null {
  const userId = profile?.id
  useEffect(() => {
    if (!profile || !userId) return
    let active = true
    ;(async () => {
      let p = await assignSpeciesIfMissing(supabase, profile, Math.random())
      p = await recordDailyLogin(supabase, p, todayISO())
      if (active) onProfileChange(p)
    })().catch((e) => console.error(e))
    return () => { active = false }
    // Runs once per user; onProfileChange/profile identity intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!profile || !profile.mascot_species) return null
  return deriveMascotState(profile, todayISO())
}
```

- [ ] **Step 2: Update `src/App.test.tsx` to isolate gating from the mascot**

Add this mock near the other `vi.mock` calls at the top of the file (so App-gating tests don't invoke Supabase through the hook):

```tsx
vi.mock('./mascot/useMascot', () => ({ useMascot: () => null }))
```

- [ ] **Step 3: Run App tests to verify they still pass**

Run: `npm test -- src/App.test.tsx`
Expected: PASS (4 tests) — gating unaffected.

- [ ] **Step 4: Wire the hook + component into `src/App.tsx`**

Add the imports:

```tsx
import { useMascot } from './mascot/useMascot'
import { MascotZone } from './components/MascotZone'
```

Inside `App()`, after the existing `handleOnboard` definition, add:

```tsx
  const mascot = useMascot(profile, setProfile)
```

Replace the final return line:

```tsx
  return (<><TextureOverlay /><Hero profile={profile!} onSignOut={signOut} /></>)
```

with:

```tsx
  return (
    <>
      <TextureOverlay />
      <Hero profile={profile!} onSignOut={signOut} />
      {mascot && <MascotZone state={mascot} />}
    </>
  )
```

- [ ] **Step 5: Run the full suite + typecheck + build**

Run: `npm test`
Expected: all tests PASS.
Run: `npx tsc -b --noEmit`
Expected: clean.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual live E2E (operator, requires Task 1 migration applied)**

Run `npm run dev`, sign in:
- First load: hero shows, and below it the **MascotZone** appears with a randomly hatched animal, `Lv. 1`, `현재 <단계>` matching your training progress, mood `쌩쌩` (active today), `1일 연속`.
- The XP bar shows `10 / 100` after the daily login grant (check Supabase `xp_events` has one `daily_login` row; `profiles.mascot_species` is set, `last_active_on` = today, `streak_days` = 1).
- Reload the page same day → still `Lv. 1`, `10 / 100` (no double grant), same species.
- Click the arrows → the mascot previews other stages (`인턴/주니어/시니어/치프 단계`) while `현재 <단계>` stays fixed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mascot): wire useMascot + MascotZone into the dashboard"
```

---

## Self-Review (completed by author)

**Spec coverage** (`2026-07-14-resq-mascot-design.md`):
- §3 Data model: `xp_events` + profile columns → Task 1; roster/events config → Task 2. ✓
- §5 XP/level/stage: curve → Task 3; stage-from-progress → Task 4; two-axis combine → Task 6. ✓
- §6 States: species (Task 5), stage (Task 4), mood (Task 4), combined (Task 6), rendered (Task 9). ✓
- §4 UI: MascotZone carousel + panel → Task 9; integrated as hero anchor → Task 10. ✓
- Random hatch + daily-login-only XP → Task 8 (`assignSpeciesIfMissing`, `recordDailyLogin`) + Task 10 wiring. ✓
- §7 Tests: pure logic (Tasks 3–6), data access (Task 8), component (Task 9), gating isolation + live E2E (Task 10). ✓
- §10 Deferred: no collection/re-roll/shop/props; only `daily_login` emits; no new deps; placeholder art via registry (Task 7). ✓

**Placeholder scan:** none. Emoji art + `mascotArt`'s ignored `_stage` param are intentional, documented forward-compat seams.

**Type consistency:** `Profile` optional fields (Task 1) used in Tasks 6/8/10; `MascotState`/`Stage`/`Mood` defined in Tasks 6/4 and consumed identically in Tasks 9/10; `pickSpecies(rand)`, `assignSpeciesIfMissing(client,profile,rand)`, `recordDailyLogin(client,profile,todayISO)`, `deriveMascotState(profile,todayISO)`, `mascotArt(speciesId,stage)` signatures are consistent across definition and call sites. ✓

## Explicitly Deferred (NOT in this slice)
- Multi-animal collection, re-roll/gacha, shop, props/outfit economy.
- XP from papers / schedules / weekly academic reports (types defined, not emitted).
- Real premium animal art (placeholder emoji via swappable registry for now).
- Atomic server-side daily-login (client read-modify-write is acceptable at single-user scale; revisit if abuse matters).
- Any paper pipeline / calendar / Gmail / PubMed work.
