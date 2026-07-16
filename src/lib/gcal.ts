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
