# ResQ Mascot Hero Rework Implementation Plan (Slice 2.5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 큐비 the star of the home screen — specialty-determined animal + hashed random variant, CSS-dimensional center-stage presentation inside the hero, and KST day/night sky backgrounds (CloudFront video removed).

**Architecture:** Rework `src/mascot/roster.ts` from a random-species roster to a specialty→animal mapping with 4 hashed variants (no DB change — species and variant are derived at render time). Delete `species.ts`, `assignSpeciesIfMissing`, and the standalone `MascotZone` (absorbed into a rebuilt `Hero`). A new pure `daylight.ts` module decides the sky scene from KST. All logic stays pure and unit-tested; `recordDailyLogin`/XP/mood/stage are reused unchanged.

**Tech Stack:** Unchanged — React 19 + TS + Vite + Tailwind v3 + Vitest. **No new dependencies.** CSS keyframes/transforms only.

**Branch:** continue on `feat/mascot` (updates PR #2 to the final mascot form).

---

## File Structure

```
src/mascot/daylight.ts        # NEW: timeOfDayKST + SKY gradients        (pure)
src/mascot/roster.ts          # REWORK: specialty→animal map + variants  (config)
src/mascot/mascotAssets.ts    # REWORK: glyph now lives on Animal
src/mascot/state.ts           # REWORK: derive species from specialty, variant from hash
src/mascot/mascot.ts          # SHRINK: recordDailyLogin only (assignSpeciesIfMissing removed)
src/mascot/useMascot.ts       # SIMPLIFY: no species assignment
src/mascot/species.ts         # DELETE (+ its test)
src/components/MascotZone.tsx # DELETE (+ its test) — absorbed into Hero
src/components/Hero.tsx       # REWORK: mascot center stage + sky + stat bar
src/components/Onboarding.tsx # 전공 free text → select
src/index.css                 # + float keyframes
src/App.tsx                   # Hero gets mascot prop; MascotZone removed
```

---

### Task 1: KST daylight module

**Files:**
- Create: `src/mascot/daylight.ts`, `src/mascot/daylight.test.ts`

- [ ] **Step 1: Write the failing test `src/mascot/daylight.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { timeOfDayKST, SKY } from './daylight'

// UTC instants chosen so the KST (+9) hour hits each boundary.
describe('timeOfDayKST', () => {
  it('maps KST hours to phases regardless of machine timezone', () => {
    expect(timeOfDayKST(new Date('2026-07-15T20:00:00Z'))).toBe('DAWN')  // 05:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T22:59:00Z'))).toBe('DAWN')  // 07:59 KST
    expect(timeOfDayKST(new Date('2026-07-15T23:00:00Z'))).toBe('DAY')   // 08:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T00:00:00Z'))).toBe('DAY')   // 09:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T08:00:00Z'))).toBe('DUSK')  // 17:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T10:59:00Z'))).toBe('DUSK')  // 19:59 KST
    expect(timeOfDayKST(new Date('2026-07-15T11:00:00Z'))).toBe('NIGHT') // 20:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T15:00:00Z'))).toBe('NIGHT') // 00:00 KST
    expect(timeOfDayKST(new Date('2026-07-15T19:59:00Z'))).toBe('NIGHT') // 04:59 KST
  })
  it('has a sky gradient for every phase', () => {
    for (const p of ['DAWN', 'DAY', 'DUSK', 'NIGHT'] as const) {
      expect(SKY[p]).toContain('gradient')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/daylight.test.ts`
Expected: FAIL — cannot find module `./daylight`.

- [ ] **Step 3: Create `src/mascot/daylight.ts`**

```ts
export type DayPhase = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT'

/** Hour (0-23) in Asia/Seoul, independent of the machine timezone. */
export function hourInKST(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  )
}

/** Sky scene by KST: 새벽 05–08 / 낮 08–17 / 노을 17–20 / 밤 20–05. */
export function timeOfDayKST(now: Date = new Date()): DayPhase {
  const h = hourInKST(now)
  if (h >= 5 && h < 8) return 'DAWN'
  if (h >= 8 && h < 17) return 'DAY'
  if (h >= 17 && h < 20) return 'DUSK'
  return 'NIGHT'
}

/** CSS background per phase. Deep-navy base keeps the ResQ identity at night. */
export const SKY: Record<DayPhase, string> = {
  DAWN: 'linear-gradient(180deg, #1a2151 0%, #5b4a8a 55%, #d98a6a 100%)',
  DAY: 'linear-gradient(180deg, #2a4d8f 0%, #4a7bc4 60%, #8fb8e8 100%)',
  DUSK: 'linear-gradient(180deg, #101643 0%, #6a3d7a 55%, #e8734a 100%)',
  NIGHT: 'linear-gradient(180deg, #010828 0%, #0a1240 60%, #1a2151 100%)',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/mascot/daylight.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): KST day/night phases and sky gradients"
```

---

### Task 2: Roster rework — specialty→animal + variants (species.ts deleted)

**Files:**
- Rewrite: `src/mascot/roster.ts`, `src/mascot/roster.test.ts`, `src/mascot/mascotAssets.ts`, `src/mascot/mascotAssets.test.ts`
- Delete: `src/mascot/species.ts`, `src/mascot/species.test.ts`

- [ ] **Step 1: Rewrite the test `src/mascot/roster.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  ANIMALS, animalById, animalForSpecialty, SPECIALTIES,
  VARIANTS, variantForUser,
} from './roster'
import { XP_AMOUNTS } from './events'

describe('specialty → animal mapping', () => {
  it('maps representative specialties to their animals', () => {
    expect(animalForSpecialty('내과').id).toBe('dog')
    expect(animalForSpecialty('정형외과').id).toBe('cow')
    expect(animalForSpecialty('외과').id).toBe('horse')
    expect(animalForSpecialty('마취통증의학과').id).toBe('chameleon')
    expect(animalForSpecialty('응급의학과').id).toBe('tiger')
  })
  it('falls back to alpaca for unmapped/missing specialty', () => {
    expect(animalForSpecialty('우주의학과').id).toBe('alpaca')
    expect(animalForSpecialty(null).id).toBe('alpaca')
    expect(animalForSpecialty(undefined).id).toBe('alpaca')
  })
  it('every mapped specialty resolves to a real animal with label/tint/glyph', () => {
    for (const s of SPECIALTIES) {
      const a = animalForSpecialty(s)
      expect(a.label).toBeTruthy()
      expect(a.tint).toMatch(/^#/)
      expect(a.glyph).toBeTruthy()
    }
  })
  it('animalById finds and misses correctly', () => {
    expect(animalById('dog')?.label).toBe('강아지')
    expect(animalById('nope')).toBeUndefined()
    expect(ANIMALS.length).toBeGreaterThan(10)
  })
})

describe('variants', () => {
  it('is stable for the same user id', () => {
    expect(variantForUser('user-abc')).toBe(variantForUser('user-abc'))
  })
  it('always returns one of the 4 variants', () => {
    for (const id of ['a', 'bb', 'ccc', 'u-1', 'u-2', 'u-3']) {
      expect(VARIANTS).toContain(variantForUser(id))
    }
  })
  it('spreads across variants for different ids', () => {
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) => variantForUser(`user-${i}`).id),
    )
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})

describe('xp amounts (unchanged)', () => {
  it('still defines all event types', () => {
    expect(XP_AMOUNTS.daily_login).toBe(10)
    expect(XP_AMOUNTS.read_paper).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/roster.test.ts`
Expected: FAIL — `animalForSpecialty` etc. not exported.

- [ ] **Step 3: Rewrite `src/mascot/roster.ts`**

```ts
export interface Animal {
  id: string
  label: string // Korean animal name
  glyph: string // placeholder art until real line-art lands
  tint: string  // sky/panel blend color
}

// 십이지 + α. Hospital-friendly anthropomorphized animals; art swapped later.
export const ANIMALS: Animal[] = [
  { id: 'dog', label: '강아지', glyph: '🐶', tint: '#f59e0b' },
  { id: 'cow', label: '소', glyph: '🐮', tint: '#7c5cff' },
  { id: 'horse', label: '말', glyph: '🐴', tint: '#a16207' },
  { id: 'chameleon', label: '카멜레온', glyph: '🦎', tint: '#22c55e' },
  { id: 'rabbit', label: '토끼', glyph: '🐰', tint: '#ec4899' },
  { id: 'rooster', label: '닭', glyph: '🐔', tint: '#ef4444' },
  { id: 'cat', label: '고양이', glyph: '🐱', tint: '#8b5cf6' },
  { id: 'monkey', label: '원숭이', glyph: '🐵', tint: '#d97706' },
  { id: 'tiger', label: '호랑이', glyph: '🐯', tint: '#f97316' },
  { id: 'dragon', label: '용', glyph: '🐲', tint: '#0ea5e9' },
  { id: 'snake', label: '뱀', glyph: '🐍', tint: '#10b981' },
  { id: 'mouse', label: '쥐', glyph: '🐭', tint: '#94a3b8' },
  { id: 'sheep', label: '양', glyph: '🐑', tint: '#cbd5e1' },
  { id: 'pig', label: '돼지', glyph: '🐷', tint: '#f472b6' },
  { id: 'bear', label: '곰', glyph: '🐻', tint: '#92400e' },
  { id: 'alpaca', label: '알파카', glyph: '🦙', tint: '#eab308' },
]

export function animalById(id: string): Animal | undefined {
  return ANIMALS.find((a) => a.id === id)
}

export const DEFAULT_ANIMAL_ID = 'alpaca'

/** 전공 → 대표 동물. Config — edit freely; unmapped falls back to alpaca. */
export const SPECIALTY_ANIMALS: Record<string, string> = {
  내과: 'dog',
  정형외과: 'cow',
  외과: 'horse',
  마취통증의학과: 'chameleon',
  소아청소년과: 'rabbit',
  산부인과: 'rooster',
  정신건강의학과: 'cat',
  영상의학과: 'monkey',
  응급의학과: 'tiger',
  신경과: 'dragon',
  신경외과: 'dragon',
  피부과: 'snake',
  이비인후과: 'mouse',
  안과: 'sheep',
  비뇨의학과: 'pig',
  가정의학과: 'bear',
}

/** Onboarding select options (mapped specialties, in declaration order). */
export const SPECIALTIES = Object.keys(SPECIALTY_ANIMALS)

export function animalForSpecialty(specialty: string | null | undefined): Animal {
  const id = (specialty && SPECIALTY_ANIMALS[specialty]) || DEFAULT_ANIMAL_ID
  return animalById(id)!
}

export interface Variant {
  id: string
  label: string  // hatch personality
  accent: string // accent color in the stat bar
}

export const VARIANTS: Variant[] = [
  { id: 'brave', label: '씩씩이', accent: '#ff6b6b' },
  { id: 'gentle', label: '순둥이', accent: '#ffd166' },
  { id: 'clever', label: '똘똘이', accent: '#4ecdc4' },
  { id: 'quirky', label: '엉뚱이', accent: '#c792ea' },
]

/** Stable "random" hatch: hash the user id — no DB round-trip, fixed per user. */
export function variantForUser(userId: string): Variant {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return VARIANTS[h % VARIANTS.length]
}
```

- [ ] **Step 4: Rewrite `src/mascot/mascotAssets.ts` (glyph now lives on Animal)**

```ts
import type { Stage } from './stage'
import { animalById } from './roster'

// The ONLY place art is resolved — swapping glyph → <img src> later is a
// one-file change. `stage` is accepted so future art can vary per stage.
export function mascotArt(animalId: string, _stage: Stage): string {
  return animalById(animalId)?.glyph ?? '🐣'
}
```

And `src/mascot/mascotAssets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mascotArt } from './mascotAssets'
import { ANIMALS } from './roster'

describe('mascotArt', () => {
  it('returns a glyph for every animal', () => {
    for (const a of ANIMALS) {
      expect(mascotArt(a.id, 'INTERN')).toBe(a.glyph)
    }
  })
  it('falls back for an unknown animal', () => {
    expect(mascotArt('nope', 'CHIEF')).toBe('🐣')
  })
})
```

- [ ] **Step 5: Delete the random-species module**

```bash
git rm src/mascot/species.ts src/mascot/species.test.ts
```

(`state.ts`/`mascot.ts` still reference old exports — they are fixed in Tasks 3–4; run only the two rewritten test files for now.)

- [ ] **Step 6: Run the two rewritten test files**

Run: `npm test -- src/mascot/roster.test.ts src/mascot/mascotAssets.test.ts`
Expected: PASS. (Full suite is expected RED until Task 4 — that's the planned mid-rework state.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mascot): specialty-to-animal roster with hashed variants"
```

---

### Task 3: State combiner rework

**Files:**
- Modify: `src/mascot/state.ts`, `src/mascot/state.test.ts`

- [ ] **Step 1: Rewrite the test `src/mascot/state.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { deriveMascotState } from './state'
import { variantForUser } from './roster'
import type { Profile } from '../lib/profile'

const base: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 150, mascot_level: 1, mascot_stage: 1,
  mascot_species: null, mascot_name: null, last_active_on: '2026-07-15', streak_days: 3,
}

describe('deriveMascotState (specialty-driven)', () => {
  it('derives the animal from the specialty, not from stored species', () => {
    const s = deriveMascotState(base, '2026-07-15')
    expect(s.speciesId).toBe('dog')       // 내과 → 강아지
    expect(s.speciesLabel).toBe('강아지')
    expect(s.name).toBe('큐비')
    expect(s.level).toBe(2)
    expect(s.stage).toBe('SENIOR')
    expect(s.mood).toBe('ENERGIZED')
  })
  it('assigns a stable hashed variant', () => {
    const s = deriveMascotState(base, '2026-07-15')
    const v = variantForUser('u1')
    expect(s.variantLabel).toBe(v.label)
    expect(s.variantAccent).toBe(v.accent)
    expect(deriveMascotState(base, '2026-07-15').variantLabel).toBe(s.variantLabel)
  })
  it('falls back to alpaca for an unmapped specialty', () => {
    const s = deriveMascotState({ ...base, specialty: '우주의학과' }, '2026-07-15')
    expect(s.speciesId).toBe('alpaca')
  })
  it('ignores the legacy stored mascot_species column', () => {
    const s = deriveMascotState({ ...base, mascot_species: 'penguin' }, '2026-07-15')
    expect(s.speciesId).toBe('dog')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/mascot/state.test.ts`
Expected: FAIL (old derivation, no variant fields).

- [ ] **Step 3: Rewrite `src/mascot/state.ts`**

```ts
import { levelProgress } from './xp'
import { stageFromProgress, type Stage } from './stage'
import { moodFor, type Mood } from './mood'
import { animalForSpecialty, variantForUser } from './roster'
import { computeDday } from '../lib/dday'
import type { Profile } from '../lib/profile'

export const DEFAULT_MASCOT_NAME = '큐비'

export interface MascotState {
  speciesId: string
  speciesLabel: string
  tint: string
  variantLabel: string
  variantAccent: string
  name: string
  stage: Stage
  mood: Mood
  level: number
  xpInLevel: number
  xpForLevel: number
  streakDays: number
}

/**
 * Species is DERIVED from the profile's specialty (전공별 대표 동물) and the
 * variant from a hash of the user id — profiles.mascot_species is intentionally
 * ignored (kept in the DB only as a future custom-override slot).
 */
export function deriveMascotState(profile: Profile, todayISO: string): MascotState {
  const animal = animalForSpecialty(profile.specialty)
  const variant = variantForUser(profile.id)
  const { percent } = computeDday(
    new Date(profile.training_start ?? todayISO),
    new Date(profile.training_end ?? todayISO),
    new Date(todayISO),
  )
  const { level, xpInLevel, xpForLevel } = levelProgress(profile.xp ?? 0)
  return {
    speciesId: animal.id,
    speciesLabel: animal.label,
    tint: animal.tint,
    variantLabel: variant.label,
    variantAccent: variant.accent,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/mascot/state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mascot): derive species from specialty, variant from user hash"
```

---

### Task 4: Data access + hook simplification

**Files:**
- Modify: `src/mascot/mascot.ts`, `src/mascot/mascot.test.ts`, `src/mascot/useMascot.ts`

- [ ] **Step 1: Remove `assignSpeciesIfMissing` from `src/mascot/mascot.ts`**

Delete the `assignSpeciesIfMissing` function and the now-unused `pickSpecies` import. The file keeps ONLY `recordDailyLogin` (unchanged) — final content:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertProfile, type Profile } from '../lib/profile'
import { XP_AMOUNTS } from './events'
import { prevDayISO } from './today'

/** Grant daily-login XP once per calendar day; updates streak and appends to the ledger. */
export async function recordDailyLogin(
  client: SupabaseClient,
  profile: Profile,
  todayISO: string,
): Promise<Profile> {
  if (profile.last_active_on === todayISO) return profile
  const amount = XP_AMOUNTS.daily_login
  // The (user_id, day) unique index makes this the source of truth for "once per
  // day": if a concurrent/StrictMode run already inserted today's login, this
  // insert errors and we return without granting XP again.
  const { error } = await client
    .from('xp_events')
    .insert({ user_id: profile.id, type: 'daily_login', amount, day: todayISO })
  if (error) return profile
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

- [ ] **Step 2: Update `src/mascot/mascot.test.ts`** — drop the `assignSpeciesIfMissing` describe block and its import; keep the four `recordDailyLogin` tests exactly as they are. Imports become:

```ts
import { describe, it, expect } from 'vitest'
import { recordDailyLogin } from './mascot'
import type { Profile } from '../lib/profile'
```

- [ ] **Step 3: Simplify `src/mascot/useMascot.ts`** — no species assignment; state derives whenever a profile exists:

```ts
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'
import { recordDailyLogin } from './mascot'
import { deriveMascotState, type MascotState } from './state'
import { todayISO } from './today'

/**
 * Records the once-per-day login (XP/streak) and returns the derived
 * MascotState (species from specialty, variant from user-id hash).
 *
 * The side effect runs exactly ONCE per user id: `ranFor` survives React
 * StrictMode's mount→cleanup→mount so the ledger isn't double-written in dev,
 * and the result is only applied if the user hasn't changed since.
 */
export function useMascot(
  profile: Profile | null,
  onProfileChange: (p: Profile) => void,
): MascotState | null {
  const userId = profile?.id
  const ranFor = useRef<string | null>(null)
  const currentUser = useRef<string | undefined>(undefined)
  currentUser.current = userId

  useEffect(() => {
    if (!profile || !userId) return
    if (ranFor.current === userId) return
    ranFor.current = userId
    recordDailyLogin(supabase, profile, todayISO())
      .then((p) => {
        if (currentUser.current === userId) onProfileChange(p)
      })
      .catch((e) => {
        console.error(e)
        if (ranFor.current === userId) ranFor.current = null // allow retry next mount
      })
    // Runs once per user id; profile/onProfileChange identity intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!profile) return null
  return deriveMascotState(profile, todayISO())
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: everything passes EXCEPT `MascotZone.test.tsx` may still pass (it's deleted in Task 5) and `App.test.tsx` still passes (its `useMascot` mock is unchanged). If `state`/`mascot`/`roster` interactions fail, fix before continuing.
Run: `npx tsc -b --noEmit` — expect clean (species.ts references are gone).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(mascot): drop stored species assignment; login XP only"
```

---

### Task 5: Onboarding — 전공 select

**Files:**
- Modify: `src/components/Onboarding.tsx`, `src/components/Onboarding.test.tsx`

- [ ] **Step 1: Update the test `src/components/Onboarding.test.tsx`** — replace the 전공 typing line and add a select-specific test. Full new content:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Onboarding } from './Onboarding'

describe('Onboarding', () => {
  it('submits the entered profile fields (전공 via select)', async () => {
    const onSubmit = vi.fn()
    render(<Onboarding onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('병원'), 'A대학교병원')
    await userEvent.selectOptions(screen.getByLabelText('전공'), '내과')
    await userEvent.type(screen.getByLabelText('연차'), '2')
    await userEvent.type(screen.getByLabelText('닉네임'), '길동')
    await userEvent.type(screen.getByLabelText('수련 시작일'), '2024-03-01')
    await userEvent.type(screen.getByLabelText('수련 종료일'), '2028-02-28')
    await userEvent.click(screen.getByRole('button', { name: /시작/ }))

    expect(onSubmit).toHaveBeenCalledWith({
      hospital: 'A대학교병원',
      specialty: '내과',
      pgy: 2,
      nickname: '길동',
      training_start: '2024-03-01',
      training_end: '2028-02-28',
    })
  })

  it('offers the mapped specialties plus 기타 as options', () => {
    render(<Onboarding onSubmit={vi.fn()} />)
    const select = screen.getByLabelText('전공') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('내과')
    expect(values).toContain('마취통증의학과')
    expect(values).toContain('기타')
  })

  it('does not submit when a required field is empty', async () => {
    const onSubmit = vi.fn()
    render(<Onboarding onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /시작/ }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Onboarding.test.tsx`
Expected: FAIL — 전공 is a text input, `selectOptions` can't be used.

- [ ] **Step 3: Update `src/components/Onboarding.tsx`** — remove 전공 from the text-`FIELDS` array and render a select between 병원 and 닉네임. Changes:

Remove `{ key: 'specialty', label: '전공', type: 'text' },` from `FIELDS` and change the FIELDS key type accordingly:

```tsx
const FIELDS: { key: 'hospital' | 'nickname' | 'training_start' | 'training_end'; label: string; type: string }[] = [
  { key: 'hospital', label: '병원', type: 'text' },
  { key: 'nickname', label: '닉네임', type: 'text' },
  { key: 'training_start', label: '수련 시작일', type: 'date' },
  { key: 'training_end', label: '수련 종료일', type: 'date' },
]
```

Add import and a `specialty` state:

```tsx
import { SPECIALTIES } from '../mascot/roster'
```

```tsx
  const [specialty, setSpecialty] = useState('')
```

In `handleSubmit`, validate/submit `specialty` from its own state:

```tsx
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const required = ['hospital', 'nickname', 'training_start', 'training_end']
    if (required.some((k) => !text[k]) || !specialty || !pgy) return
    onSubmit({
      hospital: text.hospital,
      specialty,
      pgy: Number(pgy),
      nickname: text.nickname,
      training_start: text.training_start,
      training_end: text.training_end,
    })
  }
```

Render the select right after the 병원 field (i.e., between the mapped FIELDS — simplest: render it immediately before the 연차 label, order in the form: 병원/닉네임/수련시작/수련종료 from FIELDS, then 전공 select, then 연차):

```tsx
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-cream/80">
            전공
            <select
              aria-label="전공"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon [&>option]:bg-bg"
            >
              <option value="">선택하세요</option>
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="기타">기타</option>
            </select>
          </label>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Onboarding.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(onboarding): specialty select mapped to mascot animals"
```

---

### Task 6: Hero rework — mascot center stage + KST sky (MascotZone deleted)

**Files:**
- Rewrite: `src/components/Hero.tsx`, `src/components/Hero.test.tsx`
- Modify: `src/index.css`, `src/App.tsx`, `src/App.test.tsx`
- Delete: `src/components/MascotZone.tsx`, `src/components/MascotZone.test.tsx`

- [ ] **Step 1: Rewrite the test `src/components/Hero.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Hero } from './Hero'
import { deriveMascotState } from '../mascot/state'
import type { Profile } from '../lib/profile'

const profile: Profile = {
  id: 'u1', hospital: 'A대학교병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 150, mascot_level: 1, mascot_stage: 1,
  mascot_species: null, mascot_name: null, last_active_on: '2028-02-18', streak_days: 3,
}
const mascot = deriveMascotState(profile, '2028-02-18')

describe('Hero (mascot stage)', () => {
  it('keeps nav, greeting and D-day', () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText('ResQ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /논문/ })).toBeInTheDocument()
    expect(screen.getByText(/길동/)).toBeInTheDocument()
    expect(screen.getByText('D-10')).toBeInTheDocument()
  })
  it('renders the mascot with variant and stat bar', () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText(/큐비/)).toBeInTheDocument()
    expect(screen.getByText(/Lv\.\s*2/)).toBeInTheDocument()
    // Match the stat bar's combined "variant + species" text — a bare /강아지/
    // would double-match the aria-hidden ghost label (RTL doesn't filter aria-hidden).
    expect(screen.getByText(new RegExp(`${mascot.variantLabel} ${mascot.speciesLabel}`))).toBeInTheDocument()
  })
  it('previews other stages without changing the actual stage', async () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    // actual stage text still shown in stat bar (mascot.stage = CHIEF at 2028-02-18)
    expect(screen.getByText(new RegExp(`현재`))).toBeInTheDocument()
  })
  it('renders without a stat bar when mascot is null', () => {
    render(<Hero profile={profile} mascot={null} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText(/길동/)).toBeInTheDocument()
    expect(screen.queryByText(/큐비/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Hero.test.tsx`
Expected: FAIL — Hero has no `mascot` prop yet.

- [ ] **Step 3: Add float keyframes to `src/index.css`** (append at the end)

```css
@keyframes qbi-float {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-14px) scale(1.02); }
}
.qbi-float {
  animation: qbi-float 4.5s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .qbi-float { animation: none; }
}
```

- [ ] **Step 4: Rewrite `src/components/Hero.tsx`**

```tsx
import { useState, type MouseEvent } from 'react'
import { Mail, Bird, Globe, ArrowLeft, ArrowRight } from 'lucide-react'
import { LiquidGlass } from './LiquidGlass'
import { computeDday } from '../lib/dday'
import { timeOfDayKST, SKY } from '../mascot/daylight'
import { mascotArt } from '../mascot/mascotAssets'
import type { MascotState } from '../mascot/state'
import type { Stage } from '../mascot/stage'
import type { Mood } from '../mascot/mood'
import type { Profile } from '../lib/profile'

const NAV = [
  { label: '홈', active: true },
  { label: '논문', active: true },
  { label: '캘린더', active: false },
  { label: '메일', active: false },
  { label: '설정', active: true },
]

const STAGES: Stage[] = ['INTERN', 'JUNIOR', 'SENIOR', 'CHIEF']
const STAGE_LABEL: Record<Stage, string> = { INTERN: '인턴', JUNIOR: '주니어', SENIOR: '시니어', CHIEF: '치프' }
const MOOD_LABEL: Record<Mood, string> = { ENERGIZED: '쌩쌩', NORMAL: '평온', TIRED: '지침', ASLEEP: '수면' }

export function Hero({
  profile,
  mascot,
  onSignOut,
  now = new Date(),
}: {
  profile: Profile
  mascot: MascotState | null
  onSignOut: () => void
  now?: Date
}) {
  const { daysLeft, percent } = computeDday(
    new Date(profile.training_start ?? now),
    new Date(profile.training_end ?? now),
    now,
  )
  const phase = timeOfDayKST(now)
  const actualIndex = mascot ? STAGES.indexOf(mascot.stage) : 0
  const [preview, setPreview] = useState(actualIndex)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const previewStage = STAGES[preview]
  const pct = mascot && mascot.xpForLevel > 0 ? Math.round((mascot.xpInLevel / mascot.xpForLevel) * 100) : 0

  const onMouseMove = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setParallax({
      x: ((e.clientX - r.left) / r.width - 0.5) * 16,
      y: ((e.clientY - r.top) / r.height - 0.5) * 10,
    })
  }

  return (
    <section
      onMouseMove={onMouseMove}
      className="relative min-h-screen overflow-hidden rounded-b-[32px]"
      style={{ background: SKY[phase] }}
    >
      {/* specialty tint blend + night stars (pure CSS decorations) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: mascot
            ? `radial-gradient(120% 70% at 50% 115%, ${mascot.tint}44 0%, transparent 65%)`
            : undefined,
        }}
      />
      {phase === 'NIGHT' && (
        <div aria-hidden className="absolute inset-0 opacity-70">
          {[[12, 18], [28, 9], [45, 22], [63, 12], [78, 26], [88, 8], [70, 40], [20, 38]].map(([l, t], i) => (
            <span
              key={i}
              className="absolute h-[2px] w-[2px] rounded-full bg-cream/80"
              style={{ left: `${l}%`, top: `${t}%` }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1831px] flex-col px-6 py-8 sm:px-10">
        {/* Header (unchanged) */}
        <header className="flex items-center justify-between">
          <span className="font-grotesk text-base uppercase">ResQ</span>
          <nav className="hidden lg:block">
            <LiquidGlass className="rounded-[28px]">
              <ul className="flex gap-8 px-[52px] py-[24px]">
                {NAV.map((n) => (
                  <li key={n.label}>
                    <a
                      href="#"
                      aria-disabled={!n.active}
                      className={`font-grotesk text-[13px] uppercase transition ${
                        n.active ? 'hover:text-neon' : 'cursor-not-allowed text-cream/40'
                      }`}
                    >
                      {n.label}
                      {!n.active && <span className="ml-1 text-[9px]">(곧)</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </LiquidGlass>
          </nav>
          <div className="hidden gap-2 lg:flex">
            {[Mail, Bird, Globe].map((Icon, i) => (
              <LiquidGlass key={i} className="rounded-[1rem]">
                <button className="flex h-[56px] w-[56px] items-center justify-center transition hover:bg-white/10">
                  <Icon size={20} />
                </button>
              </LiquidGlass>
            ))}
          </div>
        </header>

        {/* Info block (top-left, compact) */}
        <div className="mt-10 max-w-sm">
          <p className="font-mono text-sm uppercase text-cream/80">
            {profile.pgy}년차 · {profile.hospital} {profile.specialty}
          </p>
          <h1 className="font-grotesk text-[34px] uppercase leading-[1.05] sm:text-[44px]">
            안녕, {profile.nickname}
          </h1>
          <div className="mt-4">
            <div className="flex items-baseline justify-between font-grotesk uppercase">
              <span className="text-2xl text-neon sm:text-3xl">D-{daysLeft}</span>
              <span className="font-mono text-xs text-cream/70">수련 {percent.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-neon" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>

        {/* Mascot center stage */}
        {mascot && (
          <div className="relative flex flex-1 flex-col items-center justify-center py-8">
            <span
              aria-hidden
              className="pointer-events-none absolute select-none font-grotesk uppercase leading-none text-white/5"
              style={{ fontSize: 'clamp(90px, 24vw, 300px)' }}
            >
              {mascot.speciesLabel}
            </span>
            <div
              className="relative"
              style={{ transform: `translate(${parallax.x}px, ${parallax.y}px)`, transition: 'transform 200ms ease-out' }}
            >
              <div className="qbi-float text-[110px] leading-none drop-shadow-2xl sm:text-[170px]">
                {mascotArt(mascot.speciesId, previewStage)}
              </div>
              <div
                aria-hidden
                className="mx-auto mt-2 h-4 w-32 rounded-full bg-black/40 blur-md sm:w-44"
              />
            </div>
          </div>
        )}
        {!mascot && <div className="flex-1" />}

        {/* Stat bar */}
        {mascot && (
          <LiquidGlass className="mx-auto w-full max-w-2xl rounded-[24px]">
            <div className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <span className="font-grotesk text-xl uppercase">
                  {mascot.name}
                  <span className="ml-2 font-mono text-xs normal-case" style={{ color: mascot.variantAccent }}>
                    {mascot.variantLabel} {mascot.speciesLabel}
                  </span>
                </span>
                <span className="font-grotesk text-lg uppercase text-neon">Lv. {mascot.level}</span>
              </div>
              <div>
                <div className="mb-1 flex justify-between font-mono text-[11px] uppercase text-cream/70">
                  <span>XP</span>
                  <span>{mascot.xpInLevel} / {mascot.xpForLevel}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-neon transition-[width] duration-[650ms]" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between font-mono text-xs uppercase text-cream/80">
                <span>현재 {STAGE_LABEL[mascot.stage]}</span>
                <span className="flex items-center gap-2">
                  <button
                    aria-label="이전 단계"
                    onClick={() => setPreview((p) => (p + STAGES.length - 1) % STAGES.length)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  {STAGE_LABEL[previewStage]} 프리뷰
                  <button
                    aria-label="다음 단계"
                    onClick={() => setPreview((p) => (p + 1) % STAGES.length)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10"
                  >
                    <ArrowRight size={14} />
                  </button>
                </span>
                <span>기분 {MOOD_LABEL[mascot.mood]}</span>
                <span>{mascot.streakDays}일 연속</span>
              </div>
            </div>
          </LiquidGlass>
        )}

        <div className="mt-6 flex justify-center">
          <button
            onClick={onSignOut}
            className="font-mono text-xs uppercase text-cream/50 underline transition hover:text-neon"
          >
            로그아웃
          </button>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Delete MascotZone and update App wiring**

```bash
git rm src/components/MascotZone.tsx src/components/MascotZone.test.tsx
```

In `src/App.tsx`: remove the `MascotZone` import, and change the final return to pass the mascot into Hero:

```tsx
  return (
    <>
      <TextureOverlay />
      <Hero profile={profile!} mascot={mascot} onSignOut={signOut} />
    </>
  )
```

`src/App.test.tsx` needs no change (its `useMascot` mock returns `null`, and Hero handles `mascot=null`).

- [ ] **Step 6: Run the full suite, typecheck, build**

Run: `npm test` — expected: ALL PASS (MascotZone tests gone, Hero tests new).
Run: `npx tsc -b --noEmit` — clean.
Run: `npm run build` — succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(hero): mascot center stage with KST sky, parallax and stat bar"
```

---

### Task 7: Final verification + live E2E notes

- [ ] **Step 1: Full gate**

Run: `npm test && npx tsc -b --noEmit && npm run build`
Expected: all green.

- [ ] **Step 2: Dev-server boot check** — `npm run dev`, confirm clean startup, stop. (No login attempt.)

- [ ] **Step 3 (operator, manual): live E2E**
- 로그인 → 히어로 중앙에 **전공 동물**(내과면 🐶)이 떠다니고, 배경이 현재 KST 시간대(낮/노을/밤/새벽)와 일치.
- 좌상단 D-day/진행바 정상. 하단 스탯 바: `큐비 · <변형> <동물>`, Lv/XP, 기분, 연속출석.
- 마우스를 움직이면 마스코트가 미세하게 따라옴(패럴랙스). 스크롤/리사이즈 시 흔들림 없음.
- 단계 프리뷰 화살표가 동작하고 `현재 <단계>`는 불변.
- 기존 MascotZone 섹션이 없음. 리로드 시 XP 이중 적립 없음(기존 검증 유지).
- 전공이 매핑에 없는 기존 계정이면 알파카 🦙 fallback.

- [ ] **Step 4: Commit any straggler fixes**

```bash
git add -A
git commit -m "chore(mascot): hero rework polish"
```

(Skip if the tree is already clean.)

---

## Self-Review (completed by author)

**Spec coverage** (`2026-07-15-resq-mascot-hero-design.md`):
- §2 매핑+variant → Task 2 (roster) + Task 3 (state). ✓
- §2 온보딩 셀렉트 → Task 5. ✓
- §3 히어로 무대 (중앙 마스코트/고스트/패럴랙스/float/스탯바/캐러셀 축소/MascotZone 삭제) → Task 6. ✓
- §4 KST 낮/밤 + 비디오 제거 → Task 1 (daylight) + Task 6 (SKY 적용, video 미포함). ✓
- §5 DB 변경 없음 / assignSpeciesIfMissing 제거 → Task 4. ✓
- §6 테스트 목록 → Tasks 1–6의 테스트와 1:1 대응. ✓

**Placeholder scan:** none — all steps carry full code.

**Type consistency:** `MascotState` fields (`variantLabel`/`variantAccent`, Task 3) match Hero usage (Task 6); `animalForSpecialty`/`variantForUser` signatures (Task 2) match state.ts (Task 3); `Hero` props `{profile, mascot, onSignOut, now?}` match App.tsx (Task 6) and tests; `mascotArt(animalId, stage)` unchanged signature used by Hero. `useMascot` return contract (null only when no profile) is compatible with App.test's `null` mock and Hero's null guard. ✓
