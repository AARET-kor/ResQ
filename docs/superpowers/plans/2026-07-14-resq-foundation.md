# ResQ Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first working vertical slice of ResQ — a user logs in with Google, completes onboarding (hospital / specialty / PGY year / nickname / training dates), and lands on a personalized dark-space hero dashboard showing a live D-day countdown.

**Architecture:** React SPA (Vite) with a Supabase backend for Google auth + a Postgres `profiles` table (row-level-security scoped to the signed-in user). App shell gates on auth + profile completeness: unauthenticated → login screen, authenticated-but-no-profile → onboarding, else → hero dashboard. Pure business logic (D-day math) lives in framework-free modules that are unit-tested with Vitest; React components get render/interaction tests with Testing Library.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS v3, lucide-react, @supabase/supabase-js v2, Vitest + @testing-library/react + jsdom.

---

## Prerequisites (manual setup — the human operator does these once)

These require account access and cannot be done by an agent. Do them before Task 1 and keep the values for the `.env` file in Task 3.

1. **Node.js 20+** installed (`node -v`).
2. **Supabase project**: create a project at supabase.com. Copy the **Project URL** and **anon public key** (Project Settings → API).
3. **Google OAuth**: in the Supabase dashboard, Authentication → Providers → Google → enable, and follow its instructions to create a Google Cloud OAuth client (Authorized redirect URI is shown by Supabase). Paste the Google Client ID/Secret back into Supabase.
4. **Anthropic API key**: create one at console.anthropic.com (not used until the paper plan, but note it now). Keep it server-side only later.

If any of these is not ready when execution starts, stop and ask the operator rather than guessing values.

---

## File Structure

```
ResQ/
  index.html                     # fonts + root
  package.json
  tailwind.config.js             # colors + font aliases (grotesk/condiment/mono)
  postcss.config.js
  vite.config.ts                 # + vitest config
  .env.local                     # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (gitignored)
  .env.example                   # committed template
  supabase/migrations/0001_profiles.sql   # profiles table + RLS
  src/
    main.tsx                     # React root
    App.tsx                      # auth+profile gating shell
    index.css                    # tailwind layers + liquid-glass + texture
    test/setup.ts                # testing-library/jsdom setup
    lib/
      dday.ts                    # pure D-day / progress math
      supabase.ts                # supabase client singleton
      profile.ts                 # Profile type + get/upsert data access
    auth/
      AuthProvider.tsx           # session context + Google sign-in/out
    components/
      LiquidGlass.tsx            # reusable liquid-glass wrapper
      TextureOverlay.tsx         # full-screen texture blend overlay
      LoginScreen.tsx            # "sign in with Google"
      Onboarding.tsx             # profile form
      Hero.tsx                   # nav + hero dashboard with D-day
```

---

### Task 1: Scaffold the Vite + React + TS project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Scaffold and install**

Run from `/Users/a0000/Desktop/ResQ` (the repo already exists):

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install @supabase/supabase-js lucide-react
npm install -D tailwindcss@^3.4 postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

If `npm create vite` refuses because the directory is non-empty, choose "Ignore files and continue" (our only files are `.git`, `.gitignore`, `docs/`).

- [ ] **Step 2: Configure Vitest in `vite.config.ts`**

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 3: Add scripts to `package.json`**

Ensure the `"scripts"` block contains:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS project with test tooling"
```

---

### Task 2: Design system — Tailwind config, fonts, liquid-glass, texture

**Files:**
- Create: `tailwind.config.js`, `postcss.config.js`
- Modify: `index.html`, `src/index.css`

- [ ] **Step 1: Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 2: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#010828',
        cream: '#EFF4FF',
        neon: '#6FFF00',
      },
      fontFamily: {
        grotesk: ['Anton', 'sans-serif'],
        condiment: ['Condiment', 'cursive'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 3: Load fonts in `index.html`**

Set the document title and add the Google Fonts link inside `<head>`, and give `<body>` the base theme classes:

```html
<title>ResQ</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Condiment&display=swap" rel="stylesheet" />
```

Change the `<body>` tag to: `<body class="bg-bg text-cream font-mono">`

- [ ] **Step 4: Replace `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

.liquid-glass {
  background: rgba(255, 255, 255, 0.01);
  background-blend-mode: luminosity;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}
.liquid-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(180deg,
    rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%,
    rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
    rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

- [ ] **Step 5: Verify dev server renders themed background**

Run: `npm run dev`, open the local URL.
Expected: page background is deep navy `#010828`, text is off-white. No console errors. Stop the server (Ctrl-C).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: design system — theme colors, fonts, liquid-glass effect"
```

---

### Task 3: Environment + Supabase client singleton

**Files:**
- Create: `.env.example`, `.env.local` (gitignored), `src/lib/supabase.ts`, `src/lib/supabase.test.ts`, `src/test/setup.ts`

- [ ] **Step 1: Create test setup `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 2: Create `.env.example` (committed) and `.env.local` (real values, gitignored)**

`.env.example` (use valid-shaped placeholders — `@supabase/supabase-js` `createClient()` throws on a non-URL value, and Vite auto-loads `.env.local` even in test mode):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Copy it to `.env.local` and fill in the real Supabase values from Prerequisites. `.env.local` is already covered by `.gitignore` (the `.env*` pattern) — confirm with `git status` that it is untracked.

- [ ] **Step 3: Write the failing test `src/lib/supabase.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { supabase } from './supabase'

describe('supabase client', () => {
  it('exposes an auth API', () => {
    expect(supabase).toBeDefined()
    expect(typeof supabase.auth.signInWithOAuth).toBe('function')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- src/lib/supabase.test.ts`
Expected: FAIL — cannot find module `./supabase`.

- [ ] **Step 5: Create `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'anon'

export const supabase = createClient(url, anonKey)
```

(The `??` fallbacks let unit tests import the module without real env vars; production always provides them.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/lib/supabase.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: env template + supabase client singleton"
```

---

### Task 4: D-day / progress math (pure logic, TDD)

**Files:**
- Create: `src/lib/dday.ts`, `src/lib/dday.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/dday.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { computeDday } from './dday'

describe('computeDday', () => {
  const start = new Date('2024-03-01')
  const end = new Date('2028-02-28')

  it('counts whole days remaining until end', () => {
    const now = new Date('2028-02-18')
    expect(computeDday(start, end, now).daysLeft).toBe(10)
  })

  it('clamps daysLeft to 0 once the end has passed', () => {
    const now = new Date('2028-03-15')
    expect(computeDday(start, end, now).daysLeft).toBe(0)
  })

  it('reports progress percent between start and end', () => {
    const now = new Date('2026-03-01') // ~ halfway
    const { percent } = computeDday(start, end, now)
    expect(percent).toBeGreaterThan(48)
    expect(percent).toBeLessThan(52)
  })

  it('clamps percent to [0,100]', () => {
    expect(computeDday(start, end, new Date('2020-01-01')).percent).toBe(0)
    expect(computeDday(start, end, new Date('2030-01-01')).percent).toBe(100)
  })

  it('returns 100 percent when the range is non-positive', () => {
    const d = new Date('2025-01-01')
    expect(computeDday(d, d, d).percent).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/dday.test.ts`
Expected: FAIL — cannot find module `./dday`.

- [ ] **Step 3: Create `src/lib/dday.ts`**

```ts
export interface DdayResult {
  /** Whole days remaining until `end`, never negative. */
  daysLeft: number
  /** Progress from `start`→`end` as a percentage, clamped to [0,100]. */
  percent: number
}

const MS_PER_DAY = 86_400_000

export function computeDday(start: Date, end: Date, now: Date = new Date()): DdayResult {
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY))
  const total = end.getTime() - start.getTime()
  if (total <= 0) return { daysLeft, percent: 100 }
  const elapsed = now.getTime() - start.getTime()
  const percent = Math.min(100, Math.max(0, (elapsed / total) * 100))
  return { daysLeft, percent }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/dday.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: D-day and training-progress calculation"
```

---

### Task 5: Profiles table migration (Supabase SQL + RLS)

**Files:**
- Create: `supabase/migrations/0001_profiles.sql`

- [ ] **Step 1: Write the migration**

```sql
-- profiles: one row per authenticated user, scoped by RLS to that user.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hospital text,
  specialty text,
  pgy integer,
  nickname text,
  training_start date,
  training_end date,
  xp integer not null default 0,
  mascot_level integer not null default 1,
  mascot_stage integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
```

- [ ] **Step 2: Apply it to the Supabase project**

Paste the SQL into the Supabase dashboard → SQL Editor → Run. (Or `supabase db push` if the Supabase CLI is set up.)
Expected: table `public.profiles` exists with RLS enabled and three policies. Verify under Table Editor.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: profiles table migration with row-level security"
```

---

### Task 6: Profile type + data access (get / upsert)

**Files:**
- Create: `src/lib/profile.ts`, `src/lib/profile.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/profile.test.ts`**

We inject a fake supabase-like client so the logic is tested without a network.

```ts
import { describe, it, expect, vi } from 'vitest'
import { getProfile, upsertProfile, isProfileComplete, type Profile } from './profile'

function fakeClient(row: Partial<Profile> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
      upsert: (values: Partial<Profile>) => ({
        select: () => ({
          single: () => Promise.resolve({ data: { ...row, ...values }, error: null }),
        }),
      }),
    }),
  } as any
}

const full: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 0, mascot_level: 1, mascot_stage: 1,
}

describe('profile data access', () => {
  it('returns null when no row exists', async () => {
    expect(await getProfile(fakeClient(null), 'u1')).toBeNull()
  })

  it('returns the row when it exists', async () => {
    const p = await getProfile(fakeClient(full), 'u1')
    expect(p?.nickname).toBe('길동')
  })

  it('upsert returns the merged row', async () => {
    const p = await upsertProfile(fakeClient(full), { id: 'u1', nickname: '새이름' })
    expect(p.nickname).toBe('새이름')
  })

  it('isProfileComplete requires the onboarding fields', () => {
    expect(isProfileComplete(full)).toBe(true)
    expect(isProfileComplete({ ...full, nickname: null as any })).toBe(false)
    expect(isProfileComplete(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/profile.test.ts`
Expected: FAIL — cannot find module `./profile`.

- [ ] **Step 3: Create `src/lib/profile.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Profile {
  id: string
  hospital: string | null
  specialty: string | null
  pgy: number | null
  nickname: string | null
  training_start: string | null // ISO date
  training_end: string | null   // ISO date
  xp: number
  mascot_level: number
  mascot_stage: number
}

export async function getProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile) ?? null
}

export async function upsertProfile(
  client: SupabaseClient,
  values: Partial<Profile> & { id: string },
): Promise<Profile> {
  const { data, error } = await client
    .from('profiles')
    .upsert({ ...values, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw error
  return data as Profile
}

const REQUIRED: (keyof Profile)[] = [
  'hospital', 'specialty', 'pgy', 'nickname', 'training_start', 'training_end',
]

export function isProfileComplete(p: Profile | null): boolean {
  if (!p) return false
  return REQUIRED.every((k) => p[k] !== null && p[k] !== undefined && p[k] !== '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/profile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: profile type, get/upsert data access, completeness check"
```

---

### Task 7: Auth provider (session context + Google sign-in/out)

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/AuthProvider.test.tsx`

- [ ] **Step 1: Write the failing test `src/auth/AuthProvider.test.tsx`**

We mock the supabase module so no network is hit.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// vi.hoisted: vi.mock factories are hoisted above const declarations, so the
// mock fns must be created inside vi.hoisted to be referenceable in the factory.
const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession, onAuthStateChange, signInWithOAuth: vi.fn(), signOut: vi.fn() } },
}))

import { AuthProvider, useAuth } from './AuthProvider'

function Probe() {
  const { loading, session } = useAuth()
  return <div>{loading ? 'loading' : session ? 'in' : 'out'}</div>
}

describe('AuthProvider', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves to signed-out when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument())
  })

  it('resolves to signed-in when a session exists', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('in')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/auth/AuthProvider.test.tsx`
Expected: FAIL — cannot find module `./AuthProvider`.

- [ ] **Step 3: Create `src/auth/AuthProvider.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/auth/AuthProvider.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: auth provider with Google sign-in and session context"
```

---

### Task 8: Design primitives — LiquidGlass + TextureOverlay

**Files:**
- Create: `src/components/LiquidGlass.tsx`, `src/components/TextureOverlay.tsx`, `src/components/LiquidGlass.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/LiquidGlass.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiquidGlass } from './LiquidGlass'

describe('LiquidGlass', () => {
  it('renders children and applies the liquid-glass class plus overrides', () => {
    render(<LiquidGlass className="rounded-[28px]"><span>hi</span></LiquidGlass>)
    const el = screen.getByText('hi').parentElement!
    expect(el.className).toContain('liquid-glass')
    expect(el.className).toContain('rounded-[28px]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/LiquidGlass.test.tsx`
Expected: FAIL — cannot find module `./LiquidGlass`.

- [ ] **Step 3: Create `src/components/LiquidGlass.tsx`**

```tsx
import type { ReactNode } from 'react'

export function LiquidGlass({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`liquid-glass ${className}`}>{children}</div>
}
```

- [ ] **Step 4: Create `src/components/TextureOverlay.tsx`**

```tsx
/**
 * Full-screen fixed texture blend overlay. Sits above content, ignores pointer
 * events. Expects /texture.png in public/ — if absent it degrades to nothing
 * visible (no error). Swap in the real asset before release.
 */
export function TextureOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
      style={{
        backgroundImage: 'url(/texture.png)',
        backgroundSize: 'cover',
        mixBlendMode: 'lighten',
        opacity: 0.6,
      }}
    />
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/components/LiquidGlass.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: LiquidGlass and TextureOverlay design primitives"
```

---

### Task 9: Login screen

**Files:**
- Create: `src/components/LoginScreen.tsx`, `src/components/LoginScreen.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/LoginScreen.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from './LoginScreen'

describe('LoginScreen', () => {
  it('calls onSignIn when the Google button is clicked', async () => {
    const onSignIn = vi.fn()
    render(<LoginScreen onSignIn={onSignIn} />)
    await userEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(onSignIn).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/LoginScreen.test.tsx`
Expected: FAIL — cannot find module `./LoginScreen`.

- [ ] **Step 3: Create `src/components/LoginScreen.tsx`**

```tsx
import { LiquidGlass } from './LiquidGlass'

export function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="font-grotesk text-5xl uppercase sm:text-7xl">ResQ</h1>
        <p className="mt-3 font-condiment text-3xl text-neon">resident life</p>
      </div>
      <p className="max-w-xs font-mono text-sm uppercase text-cream/80">
        인턴·레지던트를 위한 올인원 비서. 구글 계정으로 시작하세요.
      </p>
      <LiquidGlass className="rounded-[1rem]">
        <button
          onClick={onSignIn}
          className="px-8 py-4 font-grotesk text-sm uppercase transition hover:text-neon"
        >
          Continue with Google
        </button>
      </LiquidGlass>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/LoginScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Google login screen"
```

---

### Task 10: Onboarding form

**Files:**
- Create: `src/components/Onboarding.tsx`, `src/components/Onboarding.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/Onboarding.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Onboarding } from './Onboarding'

describe('Onboarding', () => {
  it('submits the entered profile fields', async () => {
    const onSubmit = vi.fn()
    render(<Onboarding onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('병원'), 'A대학교병원')
    await userEvent.type(screen.getByLabelText('전공'), '내과')
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
Expected: FAIL — cannot find module `./Onboarding`.

- [ ] **Step 3: Create `src/components/Onboarding.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { LiquidGlass } from './LiquidGlass'

export interface OnboardingValues {
  hospital: string
  specialty: string
  pgy: number
  nickname: string
  training_start: string
  training_end: string
}

const FIELDS: { key: keyof Omit<OnboardingValues, 'pgy'>; label: string; type: string }[] = [
  { key: 'hospital', label: '병원', type: 'text' },
  { key: 'specialty', label: '전공', type: 'text' },
  { key: 'nickname', label: '닉네임', type: 'text' },
  { key: 'training_start', label: '수련 시작일', type: 'date' },
  { key: 'training_end', label: '수련 종료일', type: 'date' },
]

export function Onboarding({ onSubmit }: { onSubmit: (v: OnboardingValues) => void }) {
  const [text, setText] = useState<Record<string, string>>({})
  const [pgy, setPgy] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const required = ['hospital', 'specialty', 'nickname', 'training_start', 'training_end']
    if (required.some((k) => !text[k]) || !pgy) return
    onSubmit({
      hospital: text.hospital,
      specialty: text.specialty,
      pgy: Number(pgy),
      nickname: text.nickname,
      training_start: text.training_start,
      training_end: text.training_end,
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <LiquidGlass className="w-full max-w-md rounded-[28px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8">
          <h1 className="font-grotesk text-3xl uppercase">Welcome to ResQ</h1>
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 font-mono text-xs uppercase text-cream/80">
              {f.label}
              <input
                aria-label={f.label}
                type={f.type}
                value={text[f.key] ?? ''}
                onChange={(e) => setText((s) => ({ ...s, [f.key]: e.target.value }))}
                className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-cream/80">
            연차
            <input
              aria-label="연차"
              type="number"
              min={1}
              max={5}
              value={pgy}
              onChange={(e) => setPgy(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-md bg-neon px-4 py-3 font-grotesk text-sm uppercase text-bg transition hover:opacity-90"
          >
            ResQ 시작하기
          </button>
        </form>
      </LiquidGlass>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Onboarding.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: onboarding profile form"
```

---

### Task 11: Hero dashboard (nav + greeting + D-day)

**Files:**
- Create: `src/components/Hero.tsx`, `src/components/Hero.test.tsx`

- [ ] **Step 1: Write the failing test `src/components/Hero.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './Hero'
import type { Profile } from '../lib/profile'

const profile: Profile = {
  id: 'u1', hospital: 'A대학교병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 0, mascot_level: 1, mascot_stage: 1,
}

describe('Hero', () => {
  it('shows the nav, the user greeting and a D-day figure', () => {
    render(<Hero profile={profile} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText('ResQ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /논문/ })).toBeInTheDocument()
    expect(screen.getByText(/길동/)).toBeInTheDocument()
    expect(screen.getByText(/내과/)).toBeInTheDocument()
    expect(screen.getByText('D-10')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Hero.test.tsx`
Expected: FAIL — cannot find module `./Hero`.

- [ ] **Step 3: Create `src/components/Hero.tsx`**

```tsx
import { Mail, Bird, Globe } from 'lucide-react'
import { LiquidGlass } from './LiquidGlass'
import { computeDday } from '../lib/dday'
import type { Profile } from '../lib/profile'

// NOTE: lucide-react v1 removed brand icons (Twitter/Github). We use
// Mail / Bird / Globe as the email / social / web trio throughout ResQ.

const NAV = [
  { label: '홈', active: true },
  { label: '논문', active: true },
  { label: '캘린더', active: false },
  { label: '메일', active: false },
  { label: '설정', active: true },
]

const HERO_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260331_045634_e1c98c76-1265-4f5c-882a-4276f2080894.mp4'

export function Hero({
  profile,
  onSignOut,
  now = new Date(),
}: {
  profile: Profile
  onSignOut: () => void
  now?: Date
}) {
  const { daysLeft, percent } = computeDday(
    new Date(profile.training_start ?? now),
    new Date(profile.training_end ?? now),
    now,
  )

  return (
    <section className="relative min-h-screen overflow-hidden rounded-b-[32px]">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={HERO_VIDEO}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1831px] flex-col px-6 py-8 sm:px-10">
        {/* Header */}
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

        {/* Hero content */}
        <div className="relative mt-auto max-w-[780px] lg:ml-32">
          <p className="font-mono text-sm uppercase text-cream/80">
            {profile.pgy}년차 · {profile.hospital} {profile.specialty}
          </p>
          <h1 className="font-grotesk text-[40px] uppercase leading-[1.05] sm:text-[60px] md:text-[75px] lg:text-[90px] lg:leading-[1]">
            안녕, {profile.nickname}
          </h1>
          <p className="absolute -right-4 top-0 -rotate-1 font-condiment text-2xl text-neon opacity-90 mix-blend-exclusion sm:text-4xl md:text-5xl">
            resident life
          </p>

          {/* D-day */}
          <div className="mt-8 max-w-md">
            <div className="flex items-baseline justify-between font-grotesk uppercase">
              <span className="text-3xl text-neon sm:text-4xl">D-{daysLeft}</span>
              <span className="font-mono text-xs text-cream/70">
                수련 {percent.toFixed(1)}% 진행
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-neon" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="mt-8 font-mono text-xs uppercase text-cream/50 underline transition hover:text-neon"
          >
            로그아웃
          </button>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Hero.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: hero dashboard with nav, greeting and D-day countdown"
```

---

### Task 12: App shell — wire auth + profile gating

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Replace `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import { getProfile, upsertProfile, isProfileComplete, type Profile } from './lib/profile'
import { LoginScreen } from './components/LoginScreen'
import { Onboarding, type OnboardingValues } from './components/Onboarding'
import { Hero } from './components/Hero'
import { TextureOverlay } from './components/TextureOverlay'

export default function App() {
  const { session, loading, signIn, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    getProfile(supabase, userId)
      .then(setProfile)
      .finally(() => setProfileLoading(false))
  }, [userId])

  const handleOnboard = async (v: OnboardingValues) => {
    if (!userId) return
    const saved = await upsertProfile(supabase, { id: userId, ...v })
    setProfile(saved)
  }

  if (loading || (userId && profileLoading)) {
    return <div className="flex min-h-screen items-center justify-center font-mono text-sm uppercase text-cream/60">loading…</div>
  }
  if (!session) return (<><TextureOverlay /><LoginScreen onSignIn={signIn} /></>)
  if (!isProfileComplete(profile)) return (<><TextureOverlay /><Onboarding onSubmit={handleOnboard} /></>)
  return (<><TextureOverlay /><Hero profile={profile!} onSignOut={signOut} /></>)
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: no TypeScript errors, build succeeds.

- [ ] **Step 5: Manual end-to-end verification**

Run: `npm run dev` with real `.env.local` values.
- Visit the URL → see the ResQ login screen.
- Click "Continue with Google" → complete Google auth → redirected back.
- First time: see the onboarding form → fill it → submit.
- Land on the hero dashboard showing your greeting, specialty line, and a `D-<n>` figure with a progress bar.
- Reload → you skip onboarding and go straight to the hero (profile persisted).
- Click 로그아웃 → back to the login screen.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire app shell — auth + profile gating (login → onboarding → hero)"
```

---

## Self-Review (completed by author)

**Spec coverage (M1 foundation slice):**
- React+TS+Vite+Tailwind+lucide-react → Task 1, 2. ✓
- Design system (colors/fonts/liquid-glass/texture) → Task 2, 8. ✓
- Google login single sign-on → Task 7, 9, 12. ✓
- Cloud DB + profile persistence + RLS → Task 5, 6. ✓
- Onboarding (병원/전공/연차/닉네임/수련기간) → Task 10. ✓
- Hero: nav (캘린더·메일 as "곧" disabled tabs), greeting, D-day + progress → Task 11. ✓
- Readability rule (video only on hero; solid bg elsewhere) → honored; hero is the only video section here. ✓
- Deferred to later plans (out of scope here, by design): mascot zone, paper pipeline/UI, weekly CTA, calendar/gmail. ✓

**Placeholder scan:** No TBD/TODO. The one intentional external placeholder (hero CloudFront video URL, `/texture.png`) is flagged in the spec's asset policy and degrades gracefully. ✓

**Type consistency:** `Profile` shape defined in Task 6 is used identically in Tasks 11–12; `computeDday(start,end,now)` signature from Task 4 matches its call in Task 11; `OnboardingValues` from Task 10 matches `handleOnboard` in Task 12. ✓
