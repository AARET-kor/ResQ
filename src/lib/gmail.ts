import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventKind } from './events'
import { GOOGLE_AUTH_ERROR } from './gcal'
import { redactSensitiveText } from './privacy'

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

function decodeB64Url(data: string, maxBytes = 12_000): string {
  // Do not decode an unexpectedly large Gmail payload into browser memory.
  // 12 KB covers at least 4,000 Korean UTF-8 characters.
  const maxBase64Chars = Math.floor((maxBytes * 4) / 3 / 4) * 4
  const b64 = data.slice(0, maxBase64Chars).replace(/-/g, '+').replace(/_/g, '/')
  try {
    const binary = atob(b64)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

async function edgeFunctionMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown }
      if (typeof body.error === 'string' && body.error.trim()) return body.error
    } catch {
      // Fall through to the stable client-facing fallback.
    }
  }
  return fallback
}

/** Recent schedule-looking emails (subject + plain-text body), capped at 8. */
export async function listRecentEmailTexts(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<EmailText[]> {
  const auth = { Authorization: `Bearer ${token}` }
  const listRes = await fetcher(`${GMAIL}/messages?maxResults=8&q=${encodeURIComponent(QUERY)}`, { headers: auth })
  if ((listRes as Response).status === 401) throw new Error(GOOGLE_AUTH_ERROR)
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
    // Raw Gmail text is held only long enough to redact it. Only the masked
    // representation leaves this function or is sent to the Edge Function.
    out.push({
      id,
      subject: redactSensitiveText(subject).slice(0, 300),
      body: redactSensitiveText(body).slice(0, 4000),
    })
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
    throw new Error(await edgeFunctionMessage(
      error,
      '추출 서버에 연결할 수 없습니다. (extract-events 함수 배포 필요)',
    ))
  }
  // LLM output over untrusted email is untrusted itself — drop malformed
  // candidates so a missing/invalid field can never crash the review UI.
  return (data.events as unknown[]).filter(isValidExtractedEvent)
}

const VALID_KINDS = new Set(['conference', 'surgery', 'social', 'professor', 'other'])

function isValidExtractedEvent(e: unknown): e is ExtractedEvent {
  if (typeof e !== 'object' || e === null) return false
  const v = e as Record<string, unknown>
  return (
    typeof v.title === 'string' && v.title.trim().length > 0 &&
    typeof v.starts_at === 'string' && !Number.isNaN(new Date(v.starts_at).getTime()) &&
    typeof v.kind === 'string' && VALID_KINDS.has(v.kind)
  )
}
