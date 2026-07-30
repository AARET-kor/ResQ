import type { SupabaseClient } from '@supabase/supabase-js'
import type { IntegrationProvider, SyncStatus } from './integrations'

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
  source_provider?: IntegrationProvider | null
  external_id?: string | null
  external_source_id?: string | null
  external_etag?: string | null
  external_url?: string | null
  external_updated_at?: string | null
  last_synced_at?: string | null
  sync_status?: SyncStatus
  deleted_at?: string | null
  updated_at?: string
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
    .is('deleted_at', null)
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    .order('starts_at', { ascending: true })
  if (error) throw error
  return (data as EventItem[]) ?? []
}

/**
 * Lists events that overlap [startISO, endISO).
 *
 * Unlike listEventsInRange, this also returns an event that started before the
 * requested range and continues into it. A null end is treated as an instant
 * event at starts_at.
 */
export async function listEventsOverlappingRange(
  client: SupabaseClient,
  userId: string,
  startISO: string,
  endISO: string,
): Promise<EventItem[]> {
  const { data, error } = await client
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .lt('starts_at', endISO)
    .or(`ends_at.gt.${startISO},and(ends_at.is.null,starts_at.gte.${startISO})`)
    .order('starts_at', { ascending: true })
  if (error) throw error
  return (data as EventItem[]) ?? []
}

/** Mirrors the overlap semantics used by listEventsOverlappingRange. */
export function eventOverlapsRange(
  event: EventItem,
  startISO: string,
  endISO: string,
): boolean {
  const rangeStart = Date.parse(startISO)
  const rangeEnd = Date.parse(endISO)
  const eventStart = Date.parse(event.starts_at)
  const eventEnd = event.ends_at ? Date.parse(event.ends_at) : eventStart

  if ([rangeStart, rangeEnd, eventStart, eventEnd].some(Number.isNaN)) return false
  return eventStart < rangeEnd
    && (event.ends_at ? eventEnd > rangeStart : eventStart >= rangeStart)
}

export async function addEvent(
  client: SupabaseClient,
  userId: string,
  values: {
    title: string
    starts_at: string
    kind: EventKind
    ends_at?: string | null
    location?: string | null
    notes?: string | null
    source_provider?: IntegrationProvider | null
    external_source_id?: string | null
    sync_status?: SyncStatus
  },
): Promise<EventItem> {
  const { sync_status = 'pending', ...eventValues } = values
  const { data, error } = await client
    .from('events')
    .insert({ user_id: userId, ...eventValues, sync_status })
    .select()
    .single()
  if (error) throw error
  return data as EventItem
}

export async function deleteEvent(client: SupabaseClient, id: string): Promise<void> {
  const { data, error: tombstoneError } = await client
    .from('events')
    .update({
      deleted_at: new Date().toISOString(),
      sync_status: 'pending',
    })
    .eq('id', id)
    .not('external_id', 'is', null)
    .select('id')
  if (tombstoneError) throw tombstoneError
  if ((data ?? []).length > 0) return

  const { error: deleteError } = await client.from('events').delete().eq('id', id)
  if (deleteError) throw deleteError
}
