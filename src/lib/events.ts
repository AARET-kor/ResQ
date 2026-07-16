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
  gcal_id?: string | null
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
