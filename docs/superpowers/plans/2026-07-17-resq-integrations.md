# ResQ Integrations Implementation Plan (Slice 6: Google Calendar · ICS · Gmail)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect ResQ's schedule to the outside world — push events to Google Calendar (with alarms), export/subscribe via ICS for Apple/Galaxy calendars (due-dated todos included as `[할일]` entries), and extract conference/professor/event schedules from recent Gmail with Claude for one-click registration.

**Architecture:** Google access uses the Supabase session's `provider_token` (scopes added at sign-in: `calendar.events`, `gmail.readonly`); all Google API calls are client-side with injected fetch (testable). Pure `ics.ts` builds RFC5545 text used both for client download and by a token-authenticated `calendar-feed` edge function (subscribe URL). Gmail texts go to an `extract-events` edge function (Claude, JSON out); extracted candidates go through a review panel before insertion. `events.gcal_id` marks synced rows; `profiles.ics_token` keys the feed.

**Tech Stack:** unchanged, no new client deps.

**Branch:** `feat/home-sections`.

**Operator prerequisites for LIVE use (not for tests/build):** In Google Cloud console (the OAuth client already used by Supabase): enable **Google Calendar API** + **Gmail API**, add scopes `.../auth/calendar.events` and `.../auth/gmail.readonly` to the consent screen (test mode is fine). Apply migration 0007. Deploy `calendar-feed` + `extract-events` functions. Users must sign out/in once to grant the new scopes.

---

## File Structure

```
supabase/migrations/0007_integrations.sql
supabase/functions/calendar-feed/index.ts     # token → ICS (service key lookup)
supabase/functions/extract-events/index.ts    # emails → Claude → events JSON
src/lib/ics.ts (+test)                        # pure ICS builder
src/lib/gcal.ts (+test)                       # Google Calendar push
src/lib/gmail.ts (+test)                      # Gmail fetch + extraction invoke
src/lib/profile.ts                            # + ics_token?: string | null
src/auth/AuthProvider.tsx                     # signIn scopes + provider_token passthrough
src/components/sections/SyncPanel.tsx (+test) # 연동 UI + gmail review list
src/home/HomeSections.tsx                     # wiring under section 2
```

---

### Task 1: Migration + Profile/Auth groundwork

**Files:**
- Create: `supabase/migrations/0007_integrations.sql`
- Modify: `src/lib/profile.ts`, `src/auth/AuthProvider.tsx`

- [ ] **Step 1: Migration** (do NOT apply):

```sql
-- Slice 6: external calendar integrations. Re-runnable.
alter table public.events
  add column if not exists gcal_id text;
alter table public.profiles
  add column if not exists ics_token uuid not null default gen_random_uuid();
```

- [ ] **Step 2:** `Profile` interface gains `ics_token?: string | null`.

- [ ] **Step 3: AuthProvider** — request Google scopes at sign-in and expose the provider token. In `signIn`:

```ts
  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
  }
```

Add to `AuthState` and the provider value:

```ts
  /** Google OAuth access token from the current session (null when absent/expired). */
  providerToken: string | null
```

computed as `((session as unknown as { provider_token?: string })?.provider_token) ?? null`.
(Existing AuthProvider tests don't assert options/providerToken — they stay green; `useAuth` consumers get the new field.)

- [ ] **Step 4:** `npm test` green, tsc clean. Commit `feat(integrations): scopes, provider token, gcal/ics columns`.

---

### Task 2: Pure ICS builder

**Files:**
- Create: `src/lib/ics.ts`, `src/lib/ics.test.ts`

- [ ] **Step 1: Failing test `src/lib/ics.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildICS, escapeICS } from './ics'
import type { EventItem } from './events'
import type { Todo } from './todos'

const ev: EventItem = {
  id: 'e1', user_id: 'u1', title: '대한성형외과학회; 춘계, 등록', starts_at: '2026-08-20T09:00:00+09:00',
  ends_at: null, kind: 'conference', location: '코엑스', notes: null,
}
const todo: Todo = { id: 't1', user_id: 'u1', title: '초록 제출', done: false, due_date: '2026-08-01', xp_granted: false }
const doneTodo: Todo = { ...todo, id: 't2', done: true }
const noDueTodo: Todo = { ...todo, id: 't3', due_date: null }

describe('escapeICS', () => {
  it('escapes commas, semicolons and newlines', () => {
    expect(escapeICS('a,b;c\nd')).toBe('a\\,b\\;c\\nd')
  })
})

describe('buildICS', () => {
  const ics = buildICS([ev], [todo, doneTodo, noDueTodo])
  it('is a valid VCALENDAR wrapper', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('PRODID:-//ResQ//KR')
  })
  it('renders the event with UTC times, alarm and escaped summary', () => {
    expect(ics).toContain('UID:resq-ev-e1')
    expect(ics).toContain('DTSTART:20260820T000000Z') // 09:00 KST = 00:00 UTC
    expect(ics).toContain('SUMMARY:대한성형외과학회\\; 춘계\\, 등록')
    expect(ics).toContain('LOCATION:코엑스')
    expect(ics).toContain('TRIGGER:-PT30M')
  })
  it('adds a day-before alarm for conferences', () => {
    expect(ics).toContain('TRIGGER:-P1D')
  })
  it('renders only not-done, due-dated todos as all-day [할일] events', () => {
    expect(ics).toContain('UID:resq-todo-t1')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260801')
    expect(ics).toContain('SUMMARY:[할일] 초록 제출')
    expect(ics).not.toContain('resq-todo-t2')
    expect(ics).not.toContain('resq-todo-t3')
  })
  it('uses CRLF line endings', () => {
    expect(ics).toContain('\r\n')
  })
})
```

- [ ] **Step 2: Implement `src/lib/ics.ts`**

```ts
import type { EventItem } from './events'
import type { Todo } from './todos'

/** RFC5545 text escaping for SUMMARY/LOCATION/DESCRIPTION values. */
export function escapeICS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

const HOUR_MS = 3_600_000

/**
 * Build an iCalendar document from events (+30min alarm; conferences also get a
 * day-before alarm) and due-dated, not-done todos (all-day "[할일]" entries).
 * Consumed by the .ics download and the calendar-feed subscription function.
 */
export function buildICS(events: EventItem[], todos: Todo[]): string {
  const now = utcStamp(new Date().toISOString())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ResQ//KR',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:ResQ',
  ]
  for (const e of events) {
    const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + HOUR_MS).toISOString()
    lines.push(
      'BEGIN:VEVENT',
      `UID:resq-ev-${e.id}`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(e.starts_at)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeICS(e.title)}`,
    )
    if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`)
    if (e.notes) lines.push(`DESCRIPTION:${escapeICS(e.notes)}`)
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:ResQ', 'TRIGGER:-PT30M', 'END:VALARM')
    if (e.kind === 'conference') {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:ResQ', 'TRIGGER:-P1D', 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  for (const t of todos) {
    if (t.done || !t.due_date) continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:resq-todo-${t.id}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${t.due_date.replace(/-/g, '')}`,
      `SUMMARY:${escapeICS(`[할일] ${t.title}`)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
```

- [ ] **Step 3:** PASS (6 tests). Commit `feat(integrations): pure ICS builder with alarms and todo entries`.

---

### Task 3: Google Calendar + Gmail clients

**Files:**
- Create: `src/lib/gcal.ts`, `src/lib/gcal.test.ts`, `src/lib/gmail.ts`, `src/lib/gmail.test.ts`

- [ ] **Step 1: Failing tests.** `src/lib/gcal.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { insertGoogleEvent, markEventSynced, GOOGLE_AUTH_ERROR } from './gcal'
import type { EventItem } from './events'

const ev: EventItem = {
  id: 'e1', user_id: 'u1', title: '학회', starts_at: '2026-08-20T09:00:00+09:00',
  ends_at: null, kind: 'conference', location: '코엑스', notes: null,
}

describe('insertGoogleEvent', () => {
  it('POSTs the event with alarms and returns the gcal id', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ id: 'g123' }) })
    const id = await insertGoogleEvent('tok', ev, fetcher as any)
    expect(id).toBe('g123')
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toContain('calendars/primary/events')
    expect(init.headers.Authorization).toBe('Bearer tok')
    const body = JSON.parse(init.body)
    expect(body.summary).toBe('학회')
    expect(body.reminders.overrides).toEqual([
      { method: 'popup', minutes: 30 },
      { method: 'popup', minutes: 1440 }, // conference → day-before too
    ])
    expect(body.end.dateTime).toBeTruthy() // 1h default end
  })
  it('throws GOOGLE_AUTH_ERROR on 401 so the UI can prompt reconnect', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    await expect(insertGoogleEvent('tok', ev, fetcher as any)).rejects.toThrow(GOOGLE_AUTH_ERROR)
  })
})

describe('markEventSynced', () => {
  it('stores the gcal id on the event row', async () => {
    const calls: any[] = []
    const client = {
      from: () => ({
        update: (v: any) => ({ eq: (_c: string, id: string) => { calls.push({ id, ...v }); return Promise.resolve({ error: null }) } }),
      }),
    } as any
    await markEventSynced(client, 'e1', 'g123')
    expect(calls[0]).toEqual({ id: 'e1', gcal_id: 'g123' })
  })
})
```

`src/lib/gmail.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { listRecentEmailTexts, requestEventExtraction } from './gmail'

describe('listRecentEmailTexts', () => {
  it('lists candidate messages and decodes their bodies', async () => {
    const bodyB64 = btoa(unescape(encodeURIComponent('학회 안내: 8월 20일 코엑스'))).replace(/\+/g, '-').replace(/\//g, '_')
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [{ id: 'm1' }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
        payload: {
          headers: [{ name: 'Subject', value: '추계학술대회 안내' }],
          parts: [{ mimeType: 'text/plain', body: { data: bodyB64 } }],
        },
        snippet: 'snippet',
      }) })
    const emails = await listRecentEmailTexts('tok', fetcher as any)
    expect(emails).toHaveLength(1)
    expect(emails[0].subject).toBe('추계학술대회 안내')
    expect(emails[0].body).toContain('코엑스')
    expect(fetcher.mock.calls[0][0]).toContain('gmail/v1/users/me/messages')
    expect(fetcher.mock.calls[0][0]).toContain('newer_than')
  })
  it('returns [] when there are no matches', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
    expect(await listRecentEmailTexts('tok', fetcher as any)).toEqual([])
  })
  it('throws on 401', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(listRecentEmailTexts('tok', fetcher as any)).rejects.toThrow()
  })
})

describe('requestEventExtraction', () => {
  it('invokes the edge function and returns candidates', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { events: [{ title: '추계학술대회', starts_at: '2026-08-20T09:00:00+09:00', kind: 'conference' }] }, error: null })
    const client = { functions: { invoke } } as any
    const out = await requestEventExtraction(client, [{ subject: 's', body: 'b' }], '성형외과')
    expect(out).toHaveLength(1)
    expect(invoke.mock.calls[0][0]).toBe('extract-events')
  })
  it('throws a friendly error when the function is unreachable', async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } }) } } as any
    await expect(requestEventExtraction(client, [], null)).rejects.toThrow(/추출 서버/)
  })
})
```

- [ ] **Step 2: Implement.** `src/lib/gcal.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventItem } from './events'

export const GOOGLE_AUTH_ERROR = 'Google 연결이 만료되었습니다. 로그아웃 후 다시 로그인해주세요.'
const HOUR_MS = 3_600_000

/** Push one event to the user's primary Google Calendar; returns the gcal event id. */
export async function insertGoogleEvent(
  token: string,
  ev: EventItem,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const overrides = [{ method: 'popup', minutes: 30 }]
  if (ev.kind === 'conference') overrides.push({ method: 'popup', minutes: 1440 })
  const res = await fetcher('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: ev.title,
      location: ev.location ?? undefined,
      description: ev.notes ?? undefined,
      start: { dateTime: ev.starts_at },
      end: { dateTime: ev.ends_at ?? new Date(new Date(ev.starts_at).getTime() + HOUR_MS).toISOString() },
      reminders: { useDefault: false, overrides },
    }),
  })
  if ((res as Response).status === 401) throw new Error(GOOGLE_AUTH_ERROR)
  if (!res.ok) throw new Error(`gcal insert failed: ${(res as Response).status}`)
  const data = await res.json()
  return data.id as string
}

export async function markEventSynced(client: SupabaseClient, eventId: string, gcalId: string): Promise<void> {
  const { error } = await client.from('events').update({ gcal_id: gcalId }).eq('id', eventId)
  if (error) throw error
}
```

`src/lib/gmail.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventKind } from './events'

export interface EmailText {
  id?: string
  subject: string
  body: string
}

export interface ExtractedEvent {
  title: string
  starts_at: string
  ends_at?: string | null
  location?: string | null
  kind: EventKind
}

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const QUERY = 'newer_than:14d (학회 OR 학술대회 OR 심포지엄 OR 연수강좌 OR conference OR symposium OR 일정 OR 초청)'

function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(escape(atob(b64)))
  } catch {
    return ''
  }
}

/** Recent schedule-looking emails (subject + plain-text body), capped at 8. */
export async function listRecentEmailTexts(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<EmailText[]> {
  const auth = { Authorization: `Bearer ${token}` }
  const listRes = await fetcher(`${GMAIL}/messages?maxResults=8&q=${encodeURIComponent(QUERY)}`, { headers: auth })
  if (!listRes.ok) throw new Error(`gmail list failed: ${(listRes as Response).status}`)
  const list = await listRes.json()
  const ids: { id: string }[] = list.messages ?? []
  const out: EmailText[] = []
  for (const { id } of ids) {
    const mRes = await fetcher(`${GMAIL}/messages/${id}?format=full`, { headers: auth })
    if (!mRes.ok) continue
    const m = await mRes.json()
    const subject =
      (m.payload?.headers as { name: string; value: string }[] | undefined)
        ?.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '(제목 없음)'
    const parts = (m.payload?.parts ?? [m.payload]).filter(Boolean)
    const plain = parts.find((p: any) => p?.mimeType === 'text/plain')?.body?.data
    const body = (plain ? decodeB64Url(plain) : m.snippet ?? '').slice(0, 4000)
    out.push({ id, subject, body })
  }
  return out
}

/** Claude-backed extraction of calendar candidates from email texts. */
export async function requestEventExtraction(
  client: SupabaseClient,
  emails: EmailText[],
  specialty: string | null,
): Promise<ExtractedEvent[]> {
  const { data, error } = await client.functions.invoke('extract-events', {
    body: { emails, specialty },
  })
  if (error || !data?.events) {
    throw new Error('추출 서버에 연결할 수 없습니다. (extract-events 함수 배포 필요)')
  }
  return data.events as ExtractedEvent[]
}
```

- [ ] **Step 3:** PASS. Commit `feat(integrations): google calendar push and gmail extraction clients`.

---

### Task 4: Edge functions (calendar-feed, extract-events)

**Files:**
- Create: `supabase/functions/calendar-feed/index.ts`, `supabase/functions/extract-events/index.ts`

- [ ] **Step 1: `supabase/functions/extract-events/index.ts`**

```ts
// Edge Function: extract-events — Claude parses schedule emails into events JSON.
// Deploy: supabase functions deploy extract-events (ANTHROPIC_API_KEY secret shared)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { emails, specialty } = await req.json()
    if (!Array.isArray(emails) || emails.length === 0) {
      return Response.json({ events: [] }, { headers: CORS })
    }
    const digest = emails
      .map((e: { subject: string; body: string }, i: number) => `[메일 ${i + 1}] 제목: ${e.subject}\n${e.body}`)
      .join('\n\n---\n\n')
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content:
            `${specialty ?? '의학'} 전공의의 메일에서 실제 일정(학회/학술대회/행사/교수님 일정/회식 등)만 추출해 ` +
            `JSON으로 반환하세요. 확실한 날짜가 있는 것만. 연도가 없으면 가장 가까운 미래로 해석. ` +
            `형식: {"events":[{"title":string,"starts_at":"YYYY-MM-DDTHH:mm:00+09:00","ends_at":string|null,` +
            `"location":string|null,"kind":"conference"|"surgery"|"social"|"professor"|"other"}]} ` +
            `JSON 외 다른 텍스트 금지. 일정이 없으면 {"events":[]}.\n\n${digest}`,
        }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return Response.json({ error: `anthropic ${res.status}: ${detail}` }, { status: 502, headers: CORS })
    }
    const data = await res.json()
    const raw: string = data.content?.[0]?.text ?? '{"events":[]}'
    const jsonText = raw.replace(/^```(json)?/m, '').replace(/```$/m, '').trim()
    let events: unknown[] = []
    try {
      events = JSON.parse(jsonText).events ?? []
    } catch {
      events = []
    }
    return Response.json({ events }, { headers: CORS })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS })
  }
})
```

- [ ] **Step 2: `supabase/functions/calendar-feed/index.ts`** — public GET keyed by the per-user `ics_token`; uses the service key server-side only. (Minimal inline ICS mirror of `src/lib/ics.ts` — Deno function can't import app code.)

```ts
// Edge Function: calendar-feed — ICS subscription feed, token-authenticated.
// Deploy: supabase functions deploy calendar-feed --no-verify-jwt
// URL: {SUPABASE_URL}/functions/v1/calendar-feed?token=<profiles.ics_token>
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}
function utc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return new Response('missing token', { status: 400 })
  const base = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  const pRes = await fetch(`${base}/rest/v1/profiles?ics_token=eq.${token}&select=id`, { headers })
  const profiles = await pRes.json()
  if (!Array.isArray(profiles) || profiles.length === 0) return new Response('not found', { status: 404 })
  const userId = profiles[0].id

  const [evRes, tdRes] = await Promise.all([
    fetch(`${base}/rest/v1/events?user_id=eq.${userId}&select=*`, { headers }),
    fetch(`${base}/rest/v1/todos?user_id=eq.${userId}&done=eq.false&select=*`, { headers }),
  ])
  const events = await evRes.json()
  const todos = await tdRes.json()

  const now = utc(new Date().toISOString())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ResQ//KR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:ResQ']
  for (const e of events) {
    const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 3_600_000).toISOString()
    lines.push('BEGIN:VEVENT', `UID:resq-ev-${e.id}`, `DTSTAMP:${now}`,
      `DTSTART:${utc(e.starts_at)}`, `DTEND:${utc(end)}`, `SUMMARY:${esc(e.title)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:ResQ', 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT')
  }
  for (const t of todos) {
    if (!t.due_date) continue
    lines.push('BEGIN:VEVENT', `UID:resq-todo-${t.id}`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${t.due_date.replace(/-/g, '')}`, `SUMMARY:${esc(`[할일] ${t.title}`)}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: { 'content-type': 'text/calendar; charset=utf-8' },
  })
})
```

- [ ] **Step 3:** `npm run build` unaffected (functions live outside `src/`). Commit `feat(integrations): calendar-feed and extract-events edge functions`.

---

### Task 5: SyncPanel UI

**Files:**
- Create: `src/components/sections/SyncPanel.tsx`, `src/components/sections/SyncPanel.test.tsx`

Props:

```ts
{
  googleConnected: boolean            // providerToken != null
  onSyncMonth: () => void             // push this month's unsynced events
  syncMessage: string | null          // result/progress/error line
  onDownloadIcs: () => void
  feedUrl: string | null              // null until ics_token exists
  onScanGmail: () => void
  scanning: boolean
  extracted: ExtractedEvent[]         // review list ([] hides it)
  onAddExtracted: (ev: ExtractedEvent) => void
  onDismissExtracted: () => void
}
```

- [ ] **Step 1: Failing test `src/components/sections/SyncPanel.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SyncPanel } from './SyncPanel'
import type { ExtractedEvent } from '../../lib/gmail'

const base = {
  googleConnected: true,
  onSyncMonth: vi.fn(),
  syncMessage: null,
  onDownloadIcs: vi.fn(),
  feedUrl: 'https://x.supabase.co/functions/v1/calendar-feed?token=abc',
  onScanGmail: vi.fn(),
  scanning: false,
  extracted: [] as ExtractedEvent[],
  onAddExtracted: vi.fn(),
  onDismissExtracted: vi.fn(),
}

describe('SyncPanel', () => {
  it('offers google sync, ics download, feed url and gmail scan when connected', async () => {
    const onSyncMonth = vi.fn(); const onDownloadIcs = vi.fn(); const onScanGmail = vi.fn()
    render(<SyncPanel {...base} onSyncMonth={onSyncMonth} onDownloadIcs={onDownloadIcs} onScanGmail={onScanGmail} />)
    await userEvent.click(screen.getByRole('button', { name: /Google 캘린더로 이번 달 보내기/ }))
    expect(onSyncMonth).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /\.ics 다운로드/ }))
    expect(onDownloadIcs).toHaveBeenCalled()
    expect(screen.getByText(/calendar-feed\?token=abc/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Gmail에서 일정 가져오기/ }))
    expect(onScanGmail).toHaveBeenCalled()
  })
  it('asks to reconnect google when not connected', () => {
    render(<SyncPanel {...base} googleConnected={false} />)
    expect(screen.getByText(/다시 로그인/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Google 캘린더로 이번 달 보내기/ })).not.toBeInTheDocument()
  })
  it('shows the sync message and scanning state', () => {
    render(<SyncPanel {...base} syncMessage="3건 동기화 완료" scanning={true} />)
    expect(screen.getByText('3건 동기화 완료')).toBeInTheDocument()
    expect(screen.getByText(/메일을 읽는 중/)).toBeInTheDocument()
  })
  it('renders extracted candidates with add/dismiss', async () => {
    const onAddExtracted = vi.fn(); const onDismissExtracted = vi.fn()
    const extracted: ExtractedEvent[] = [
      { title: '추계학술대회', starts_at: '2026-08-20T09:00:00+09:00', kind: 'conference', location: '코엑스', ends_at: null },
    ]
    render(<SyncPanel {...base} extracted={extracted} onAddExtracted={onAddExtracted} onDismissExtracted={onDismissExtracted} />)
    expect(screen.getByText('추계학술대회')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '일정에 추가' }))
    expect(onAddExtracted).toHaveBeenCalledWith(extracted[0])
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onDismissExtracted).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement** — liquid-glass card titled `외부 캘린더 연동`, rows:
  - Google: connected → `Google 캘린더로 이번 달 보내기` button + note "30분 전 알림, 학회는 하루 전 추가"; not connected → text `Google 권한이 필요합니다 — 로그아웃 후 다시 로그인하면 캘린더/Gmail 권한을 요청합니다.`
  - Apple/갤럭시: `.ics 다운로드` button + (feedUrl && `<code>{feedUrl}</code>` with caption `아이폰/갤럭시 캘린더 앱에서 '구독 캘린더 추가'에 붙여넣기`).
  - Gmail: `Gmail에서 일정 가져오기` button (connected only, disabled while scanning) / scanning → `메일을 읽는 중…`; syncMessage rendered in mono text.
  - extracted.length > 0 → review list: each row shows title/date/kind label + `일정에 추가` button; header row has `닫기` button (aria-label 닫기 conflicts with drawer? This is separate component — fine).
  Styles: follow existing section components (font-mono/grotesk, bg-white/5 rows, neon buttons).

- [ ] **Step 3:** PASS (4 tests). Commit `feat(sections): SyncPanel — google push, ics export/feed, gmail review`.

---

### Task 6: HomeSections wiring + full gate

**Files:**
- Modify: `src/home/HomeSections.tsx`

- [ ] **Step 1:** Imports: `useAuth` from `../auth/AuthProvider`; `buildICS` from `../lib/ics`; `insertGoogleEvent, markEventSynced, GOOGLE_AUTH_ERROR` from `../lib/gcal`; `listRecentEmailTexts, requestEventExtraction, type ExtractedEvent` from `../lib/gmail`; `SyncPanel` from `../components/sections/SyncPanel`.

State:

```tsx
  const { providerToken } = useAuth()
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedEvent[]>([])
```

- [ ] **Step 2: Handlers**

```tsx
  const handleSyncMonth = async () => {
    if (!providerToken) return
    setSyncMessage('동기화 중…')
    let ok = 0, failed = 0
    for (const e of events.filter((e) => !e.gcal_id)) {
      try {
        const gid = await insertGoogleEvent(providerToken, e)
        await markEventSynced(supabase, e.id, gid)
        e.gcal_id = gid
        ok++
      } catch (err) {
        failed++
        if (err instanceof Error && err.message === GOOGLE_AUTH_ERROR) { setSyncMessage(GOOGLE_AUTH_ERROR); return }
      }
    }
    setEvents((s) => [...s])
    setSyncMessage(failed ? `${ok}건 동기화, ${failed}건 실패` : ok ? `${ok}건 동기화 완료` : '이번 달에 새로 보낼 일정이 없습니다')
  }

  const handleDownloadIcs = () => {
    const ics = buildICS(events, todos)
    const a = document.createElement('a')
    a.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
    a.download = 'resq.ics'
    a.click()
  }

  const feedUrl = profile.ics_token
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${profile.ics_token}`
    : null

  const handleScanGmail = async () => {
    if (!providerToken) return
    setScanning(true)
    setSyncMessage(null)
    try {
      const emails = await listRecentEmailTexts(providerToken)
      if (emails.length === 0) { setSyncMessage('최근 2주 메일에서 일정 후보를 찾지 못했습니다'); return }
      const found = await requestEventExtraction(supabase, emails, profile.specialty)
      setExtracted(found)
      if (found.length === 0) setSyncMessage('메일에서 일정을 찾지 못했습니다')
    } catch (e) {
      console.error(e)
      setSyncMessage(e instanceof Error ? e.message : '메일 스캔에 실패했습니다')
    } finally {
      setScanning(false)
    }
  }

  const handleAddExtracted = async (ev: ExtractedEvent) => {
    try {
      await handleAddEvent({ title: ev.title, starts_at: ev.starts_at, kind: ev.kind })
      setExtracted((s) => s.filter((x) => x !== ev))
      setSyncMessage(`'${ev.title}' 일정을 추가했습니다`)
    } catch (e) { console.error(e) }
  }
```

(`EventItem` needs `gcal_id?: string | null` — add the optional field to the interface in `src/lib/events.ts`; additive, no test churn.)

- [ ] **Step 3: Render** — inside the `#schedule` section, below the todos/schedule grid:

```tsx
        <div className="mt-6">
          <SyncPanel
            googleConnected={!!providerToken}
            onSyncMonth={handleSyncMonth}
            syncMessage={syncMessage}
            onDownloadIcs={handleDownloadIcs}
            feedUrl={feedUrl}
            onScanGmail={handleScanGmail}
            scanning={scanning}
            extracted={extracted}
            onAddExtracted={handleAddExtracted}
            onDismissExtracted={() => setExtracted([])}
          />
        </div>
```

App.test's `useAuth` mock returns an object without `providerToken` — HomeSections is mocked there anyway; but SyncPanel's own tests cover UI. HomeSections uses `useAuth()` — ensure App.test's AuthProvider mock isn't loaded by HomeSections tests (HomeSections has no direct test file — fine).

- [ ] **Step 4: Full gate** — `npm test` green, tsc clean, build OK, dev boots. Commit `feat(home): wire external calendar sync, ics export and gmail extraction`.

---

## Self-Review (completed by author)

**Coverage:** 구글 캘린더 연동+알람(30분/학회 하루 전) → T3(gcal)/T6; Apple/갤럭시 → T2(ics)+T4(feed)+T6(다운로드/구독 URL); Gmail→일정 → T3(gmail)/T4(extract-events)/T5(review)/T6; 미리알림 대체([할일] ICS) → T2/T4; scopes/재로그인 흐름 → T1/T5. 팀 시트(기능6)는 slice 4에서 기구현 — 본 plan 범위 아님. ✓
**Type consistency:** `ExtractedEvent.kind: EventKind` matches `handleAddEvent`'s param; `EventItem.gcal_id?` optional (T6 note); `providerToken` on AuthState (T1) consumed in T6; SyncPanel props (T5) = T6 wiring; `GOOGLE_AUTH_ERROR` string compared by message equality in T6. ✓
**Placeholders:** none. **Known limits:** provider_token ~1h 만료(재로그인 안내로 처리, 자동 refresh는 로드맵); 1년치 학회 일정 자동 수집(크롤러)은 별도 slice; 진짜 미리알림 양방향은 불가(확정).
