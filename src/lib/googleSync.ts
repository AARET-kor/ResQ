import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventItem } from './events'
import {
  mergeDiscoveredSources,
  type DiscoveredSource,
  type IntegrationSource,
  type IntegrationSyncResult,
} from './integrations'
import type { Todo } from './todos'

export const GOOGLE_AUTH_ERROR = 'Google 연결이 만료되었습니다. 다시 연결해주세요.'

interface GoogleCalendarListEntry {
  id: string
  summary?: string
  backgroundColor?: string
  primary?: boolean
  accessRole?: string
  deleted?: boolean
}

interface GoogleCalendarEvent {
  id: string
  status?: string
  summary?: string
  location?: string
  htmlLink?: string
  etag?: string
  updated?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

interface GoogleTaskList {
  id: string
  title?: string
  updated?: string
}

interface GoogleTask {
  id: string
  title?: string
  status?: 'needsAction' | 'completed'
  due?: string
  deleted?: boolean
  hidden?: boolean
  etag?: string
  updated?: string
  selfLink?: string
}

interface Page<T> {
  items?: T[]
  nextPageToken?: string
}

function apiErrorMessage(status: number, body: unknown): string {
  if (status === 401 || status === 403) return GOOGLE_AUTH_ERROR
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { message?: string } | string }).error
    if (typeof error === 'string') return error
    if (error?.message) return error.message
  }
  return `Google API 요청에 실패했습니다. (${status})`
}

async function googleRequest<T>(
  token: string,
  url: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (response.status === 204) return undefined as T
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Some successful delete/update responses contain no JSON body.
  }
  if (!response.ok) throw new Error(apiErrorMessage(response.status, body))
  return body as T
}

async function listAll<T>(
  token: string,
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<T[]> {
  const items: T[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(baseUrl)
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const page = await googleRequest<Page<T>>(token, url.toString(), {}, fetcher)
    items.push(...(page.items ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)
  return items
}

export async function discoverGoogleSources(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<DiscoveredSource[]> {
  const [calendars, taskLists] = await Promise.all([
    listAll<GoogleCalendarListEntry>(
      token,
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?showDeleted=false&maxResults=250',
      fetcher,
    ),
    listAll<GoogleTaskList>(
      token,
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100',
      fetcher,
    ),
  ])
  return [
    ...calendars
      .filter((calendar) => !calendar.deleted)
      .map((calendar) => ({
        external_id: calendar.id,
        name: calendar.summary || calendar.id,
        color: calendar.backgroundColor ?? null,
        resource_type: 'calendar' as const,
        is_default: Boolean(calendar.primary),
        can_write: ['owner', 'writer'].includes(calendar.accessRole ?? ''),
      })),
    ...taskLists.map((list, index) => ({
      external_id: list.id,
      name: list.title || 'Google Tasks',
      resource_type: 'task_list' as const,
      is_default: index === 0,
      can_write: true,
    })),
  ]
}

export async function refreshGoogleSources(
  client: SupabaseClient,
  userId: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<IntegrationSource[]> {
  const discovered = await discoverGoogleSources(token, fetcher)
  return mergeDiscoveredSources(client, userId, 'google', discovered)
}

function dateOnlyToIso(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString()
}

function googleEventStart(event: GoogleCalendarEvent): string | null {
  if (event.start?.dateTime) return new Date(event.start.dateTime).toISOString()
  if (event.start?.date) return dateOnlyToIso(event.start.date)
  return null
}

function googleEventEnd(event: GoogleCalendarEvent): string | null {
  if (event.end?.dateTime) return new Date(event.end.dateTime).toISOString()
  if (event.end?.date) return dateOnlyToIso(event.end.date)
  return null
}

function eventPayload(event: EventItem) {
  const oneHourLater = new Date(new Date(event.starts_at).getTime() + 3_600_000).toISOString()
  return {
    summary: event.title,
    location: event.location ?? undefined,
    // Do not send private notes by default. ResQ only synchronizes the minimum
    // calendar fields needed for a unified schedule.
    start: { dateTime: event.starts_at },
    end: { dateTime: event.ends_at ?? oneHourLater },
    reminders: { useDefault: true },
  }
}

function taskPayload(todo: Todo) {
  return {
    title: todo.title,
    status: todo.done ? 'completed' : 'needsAction',
    due: todo.due_date ? `${todo.due_date}T00:00:00.000Z` : null,
    completed: todo.done ? new Date().toISOString() : null,
  }
}

async function pushPendingGoogleEvents(
  client: SupabaseClient,
  userId: string,
  token: string,
  destination: IntegrationSource | undefined,
  fetcher: typeof fetch,
): Promise<{ pushed: number; deleted: number }> {
  const { data, error } = await client
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .eq('sync_status', 'pending')
    .or('source_provider.is.null,source_provider.eq.google')
  if (error) throw error

  let pushed = 0
  let deleted = 0
  for (const event of (data as EventItem[] | null) ?? []) {
    if (!event.external_id && !destination?.can_write) continue
    const calendarId = event.external_source_id ?? destination?.external_id
    if (!calendarId) continue

    try {
      if (event.deleted_at && event.external_id) {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.external_id)}`
        try {
          await googleRequest<void>(token, url, { method: 'DELETE' }, fetcher)
        } catch (deleteError) {
          if (!(deleteError instanceof Error) || !deleteError.message.includes('(404)')) throw deleteError
        }
        const { error: removeError } = await client.from('events').delete().eq('id', event.id)
        if (removeError) throw removeError
        deleted++
        continue
      }
      if (event.deleted_at) continue

      const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
      const remote = event.external_id
        ? await googleRequest<GoogleCalendarEvent>(
            token,
            `${baseUrl}/${encodeURIComponent(event.external_id)}`,
            { method: 'PATCH', body: JSON.stringify(eventPayload(event)) },
            fetcher,
          )
        : await googleRequest<GoogleCalendarEvent>(
            token,
            baseUrl,
            { method: 'POST', body: JSON.stringify(eventPayload(event)) },
            fetcher,
          )
      const syncedAt = new Date().toISOString()
      const { error: updateError } = await client.from('events').update({
        source_provider: 'google',
        external_source_id: calendarId,
        external_id: remote.id,
        external_etag: remote.etag ?? null,
        external_url: remote.htmlLink ?? null,
        external_updated_at: remote.updated ?? syncedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
        gcal_id: remote.id,
      }).eq('id', event.id)
      if (updateError) throw updateError
      pushed++
    } catch (syncError) {
      await client.from('events').update({ sync_status: 'error' }).eq('id', event.id)
      throw syncError
    }
  }
  return { pushed, deleted }
}

async function pushPendingGoogleTasks(
  client: SupabaseClient,
  userId: string,
  token: string,
  destination: IntegrationSource | undefined,
  fetcher: typeof fetch,
): Promise<{ pushed: number; deleted: number }> {
  const { data, error } = await client
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .eq('sync_status', 'pending')
    .or('source_provider.is.null,source_provider.eq.google')
  if (error) throw error

  let pushed = 0
  let deleted = 0
  for (const todo of (data as Todo[] | null) ?? []) {
    if (!todo.external_id && !destination?.can_write) continue
    const taskListId = todo.external_source_id ?? destination?.external_id
    if (!taskListId) continue
    const baseUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`

    try {
      if (todo.deleted_at && todo.external_id) {
        try {
          await googleRequest<void>(
            token,
            `${baseUrl}/${encodeURIComponent(todo.external_id)}`,
            { method: 'DELETE' },
            fetcher,
          )
        } catch (deleteError) {
          if (!(deleteError instanceof Error) || !deleteError.message.includes('(404)')) throw deleteError
        }
        const { error: removeError } = await client.from('todos').delete().eq('id', todo.id)
        if (removeError) throw removeError
        deleted++
        continue
      }
      if (todo.deleted_at) continue

      const remote = todo.external_id
        ? await googleRequest<GoogleTask>(
            token,
            `${baseUrl}/${encodeURIComponent(todo.external_id)}`,
            { method: 'PATCH', body: JSON.stringify(taskPayload(todo)) },
            fetcher,
          )
        : await googleRequest<GoogleTask>(
            token,
            baseUrl,
            { method: 'POST', body: JSON.stringify(taskPayload(todo)) },
            fetcher,
          )
      const syncedAt = new Date().toISOString()
      const { error: updateError } = await client.from('todos').update({
        source_provider: 'google',
        external_source_id: taskListId,
        external_id: remote.id,
        external_etag: remote.etag ?? null,
        external_url: remote.selfLink ?? null,
        external_updated_at: remote.updated ?? syncedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
      }).eq('id', todo.id)
      if (updateError) throw updateError
      pushed++
    } catch (syncError) {
      await client.from('todos').update({ sync_status: 'error' }).eq('id', todo.id)
      throw syncError
    }
  }
  return { pushed, deleted }
}

async function pullGoogleCalendar(
  client: SupabaseClient,
  userId: string,
  token: string,
  source: IntegrationSource,
  timeMin: string,
  timeMax: string,
  fetcher: typeof fetch,
): Promise<{ imported: number; deleted: number }> {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.external_id)}/events`,
  )
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('showDeleted', 'true')
  url.searchParams.set('maxResults', '2500')
  url.searchParams.set('orderBy', 'startTime')
  const remoteEvents = await listAll<GoogleCalendarEvent>(token, url.toString(), fetcher)

  const cancelled = remoteEvents.filter((event) => event.status === 'cancelled')
  for (const event of cancelled) {
    const { error } = await client
      .from('events')
      .delete()
      .eq('user_id', userId)
      .eq('source_provider', 'google')
      .eq('external_source_id', source.external_id)
      .eq('external_id', event.id)
    if (error) throw error
  }

  const syncedAt = new Date().toISOString()
  const rows = remoteEvents.flatMap((event) => {
    if (event.status === 'cancelled') return []
    const startsAt = googleEventStart(event)
    if (!startsAt) return []
    return [{
      user_id: userId,
      title: event.summary?.trim() || '(제목 없음)',
      starts_at: startsAt,
      ends_at: googleEventEnd(event),
      kind: 'other',
      location: event.location ?? null,
      notes: null,
      source_provider: 'google',
      external_source_id: source.external_id,
      external_id: event.id,
      external_etag: event.etag ?? null,
      external_url: event.htmlLink ?? null,
      external_updated_at: event.updated ?? null,
      last_synced_at: syncedAt,
      sync_status: 'synced',
      deleted_at: null,
      gcal_id: event.id,
    }]
  })
  if (rows.length > 0) {
    const { error } = await client.from('events').upsert(rows, {
      onConflict: 'user_id,source_provider,external_source_id,external_id',
    })
    if (error) throw error
  }
  await client.from('integration_sources').update({
    last_synced_at: syncedAt,
    last_error: null,
  }).eq('id', source.id)
  return { imported: rows.length, deleted: cancelled.length }
}

async function pullGoogleTasks(
  client: SupabaseClient,
  userId: string,
  token: string,
  source: IntegrationSource,
  fetcher: typeof fetch,
): Promise<{ imported: number; deleted: number }> {
  const url = new URL(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(source.external_id)}/tasks`,
  )
  url.searchParams.set('showCompleted', 'true')
  url.searchParams.set('showHidden', 'true')
  url.searchParams.set('showDeleted', 'true')
  url.searchParams.set('maxResults', '100')
  const remoteTasks = await listAll<GoogleTask>(token, url.toString(), fetcher)

  const removed = remoteTasks.filter((task) => task.deleted)
  for (const task of removed) {
    const { error } = await client
      .from('todos')
      .delete()
      .eq('user_id', userId)
      .eq('source_provider', 'google')
      .eq('external_source_id', source.external_id)
      .eq('external_id', task.id)
    if (error) throw error
  }

  const syncedAt = new Date().toISOString()
  const rows = remoteTasks
    .filter((task) => !task.deleted)
    .map((task) => ({
      user_id: userId,
      title: task.title?.trim() || '(제목 없음)',
      done: task.status === 'completed',
      due_date: task.due?.slice(0, 10) ?? null,
      due_time: null,
      priority: 'normal',
      source_provider: 'google',
      external_source_id: source.external_id,
      external_id: task.id,
      external_etag: task.etag ?? null,
      external_url: task.selfLink ?? null,
      external_updated_at: task.updated ?? null,
      last_synced_at: syncedAt,
      sync_status: 'synced',
      deleted_at: null,
    }))
  if (rows.length > 0) {
    const { error } = await client.from('todos').upsert(rows, {
      onConflict: 'user_id,source_provider,external_source_id,external_id',
    })
    if (error) throw error
  }
  await client.from('integration_sources').update({
    last_synced_at: syncedAt,
    last_error: null,
  }).eq('id', source.id)
  return { imported: rows.length, deleted: removed.length }
}

export function defaultGoogleSyncWindow(now = new Date()): { timeMin: string; timeMax: string } {
  const timeMin = new Date(now)
  const timeMax = new Date(now)
  timeMin.setDate(timeMin.getDate() - 90)
  timeMax.setFullYear(timeMax.getFullYear() + 1)
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() }
}

export async function syncGoogleIntegration(
  client: SupabaseClient,
  userId: string,
  token: string,
  sources: IntegrationSource[],
  options: {
    fetcher?: typeof fetch
    now?: Date
  } = {},
): Promise<IntegrationSyncResult> {
  const fetcher = options.fetcher ?? fetch
  const selected = sources.filter((source) => source.selected)
  const selectedCalendars = selected.filter((source) => source.resource_type === 'calendar')
  const selectedTaskLists = selected.filter((source) => source.resource_type === 'task_list')
  const destinationCalendar = selectedCalendars.find((source) => source.is_default && source.can_write)
    ?? selectedCalendars.find((source) => source.can_write)
  const destinationTaskList = selectedTaskLists.find((source) => source.is_default && source.can_write)
    ?? selectedTaskLists.find((source) => source.can_write)

  const eventPush = await pushPendingGoogleEvents(
    client,
    userId,
    token,
    destinationCalendar,
    fetcher,
  )
  const taskPush = await pushPendingGoogleTasks(
    client,
    userId,
    token,
    destinationTaskList,
    fetcher,
  )

  const { timeMin, timeMax } = defaultGoogleSyncWindow(options.now)
  let importedEvents = 0
  let importedTasks = 0
  let deletedEvents = eventPush.deleted
  let deletedTasks = taskPush.deleted
  for (const source of selectedCalendars) {
    const result = await pullGoogleCalendar(
      client,
      userId,
      token,
      source,
      timeMin,
      timeMax,
      fetcher,
    )
    importedEvents += result.imported
    deletedEvents += result.deleted
  }
  for (const source of selectedTaskLists) {
    const result = await pullGoogleTasks(client, userId, token, source, fetcher)
    importedTasks += result.imported
    deletedTasks += result.deleted
  }

  return {
    importedEvents,
    importedTasks,
    pushedEvents: eventPush.pushed,
    pushedTasks: taskPush.pushed,
    deletedEvents,
    deletedTasks,
    sources: selected.length,
  }
}
