import {
  dbRows,
  dbWrite,
  readCredentials,
  storeCredentials,
  type JsonRecord,
} from '../_shared/integration.ts'
import {
  emptyResult,
  markRowError,
  markSourceSynced,
  mergeResult,
  selectedSources,
  syncWindow,
  type Source,
  type SyncResult,
} from './common.ts'

class GoogleError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new GoogleError(
      response.status,
      body?.error?.message ?? `Google API ${response.status}`,
    )
  }
  return body as T
}

async function pages<T>(
  accessToken: string,
  firstUrl: string,
): Promise<{ items: T[]; nextSyncToken: string | null }> {
  const items: T[] = []
  let nextUrl: string | null = firstUrl
  let nextSyncToken: string | null = null
  while (nextUrl) {
    const page: {
      items?: T[]
      nextPageToken?: string
      nextSyncToken?: string
    } = await request(accessToken, nextUrl)
    items.push(...(page.items ?? []))
    nextSyncToken = page.nextSyncToken ?? nextSyncToken
    if (page.nextPageToken) {
      const url = new URL(firstUrl)
      url.searchParams.set('pageToken', page.nextPageToken)
      nextUrl = url.toString()
    } else {
      nextUrl = null
    }
  }
  return { items, nextSyncToken }
}

async function accessToken(connection: JsonRecord): Promise<string> {
  const credentials = await readCredentials(connection.id)
  if (!credentials) throw new Error('GOOGLE_RECONNECT_REQUIRED')
  const expiresAt = credentials.expires_at
    ? new Date(credentials.expires_at).getTime()
    : 0
  if (expiresAt > Date.now() + 120_000) return credentials.access_token
  if (!credentials.refresh_token) throw new Error('GOOGLE_RECONNECT_REQUIRED')
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: credentials.refresh_token,
    }),
  })
  const tokens = await response.json()
  if (!response.ok || typeof tokens.access_token !== 'string') {
    await dbWrite(
      `integration_connections?id=eq.${encodeURIComponent(connection.id)}`,
      'PATCH',
      { status: 'expired', last_error: 'Google 연결을 다시 승인해주세요.' },
    )
    throw new Error('GOOGLE_RECONNECT_REQUIRED')
  }
  await storeCredentials(connection.id, {
    access_token: tokens.access_token,
    refresh_token: credentials.refresh_token,
    token_type: tokens.token_type ?? credentials.token_type,
    expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
    scope: tokens.scope ?? credentials.scope,
  })
  return tokens.access_token
}

async function refreshSources(
  userId: string,
  connectionId: string,
  token: string,
): Promise<Source[]> {
  const [calendarPage, taskListPage, existing] = await Promise.all([
    pages<JsonRecord>(
      token,
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?showDeleted=false&maxResults=250',
    ),
    pages<JsonRecord>(
      token,
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100',
    ),
    dbRows(
      `integration_sources?user_id=eq.${encodeURIComponent(userId)}` +
      '&provider=eq.google&select=*',
    ),
  ])
  const previous = new Map(
    existing.map((source) => [`${source.resource_type}:${source.external_id}`, source]),
  )
  const hasCalendar = existing.some((source) => source.resource_type === 'calendar' && source.selected)
  const hasTasks = existing.some((source) => source.resource_type === 'task_list' && source.selected)
  const rows = [
    ...calendarPage.items
      .filter((calendar) => !calendar.deleted)
      .map((calendar, index) => {
        const prior = previous.get(`calendar:${calendar.id}`)
        const writable = ['owner', 'writer'].includes(calendar.accessRole ?? '')
        return {
          user_id: userId,
          connection_id: connectionId,
          provider: 'google',
          resource_type: 'calendar',
          external_id: calendar.id,
          name: calendar.summary ?? calendar.id,
          color: calendar.backgroundColor ?? null,
          selected: prior?.selected ?? (!hasCalendar && (calendar.primary || index === 0)),
          is_default: Boolean(calendar.primary),
          can_write: writable,
          sync_mode: prior?.sync_mode ?? (writable ? 'two_way' : 'read_only'),
          metadata: {
            access_role: calendar.accessRole ?? null,
            web_url: 'https://calendar.google.com/calendar/',
          },
          last_synced_at: prior?.last_synced_at ?? null,
          last_error: null,
        }
      }),
    ...taskListPage.items.map((list, index) => {
      const prior = previous.get(`task_list:${list.id}`)
      return {
        user_id: userId,
        connection_id: connectionId,
        provider: 'google',
        resource_type: 'task_list',
        external_id: list.id,
        name: list.title ?? 'Google Tasks',
        color: null,
        selected: prior?.selected ?? (!hasTasks && index === 0),
        is_default: index === 0,
        can_write: true,
        sync_mode: prior?.sync_mode ?? 'two_way',
        metadata: { web_url: 'https://tasks.google.com/' },
        last_synced_at: prior?.last_synced_at ?? null,
        last_error: null,
      }
    }),
  ]
  if (rows.length) {
    await dbWrite(
      'integration_sources?on_conflict=user_id,provider,resource_type,external_id',
      'POST',
      rows,
      'resolution=merge-duplicates,return=minimal',
    )
  }
  return await selectedSources(userId, 'google')
}

function eventPayload(event: JsonRecord): JsonRecord {
  const end = event.ends_at
    ?? new Date(new Date(event.starts_at).getTime() + 3_600_000).toISOString()
  return {
    summary: event.title,
    location: event.location ?? undefined,
    start: { dateTime: event.starts_at },
    end: { dateTime: end },
    reminders: { useDefault: true },
  }
}

function taskPayload(todo: JsonRecord): JsonRecord {
  return {
    title: todo.title,
    status: todo.done ? 'completed' : 'needsAction',
    due: todo.due_date ? `${todo.due_date}T00:00:00.000Z` : null,
    completed: todo.done ? new Date().toISOString() : null,
  }
}

async function pushEvents(
  userId: string,
  token: string,
  sources: Source[],
): Promise<Partial<SyncResult>> {
  const writable = sources.filter(
    (source) => source.resource_type === 'calendar'
      && source.can_write
      && source.sync_mode === 'two_way',
  )
  const destination = writable.find((source) => source.is_default) ?? writable[0]
  const byId = new Map(sources.map((source) => [source.external_id, source]))
  const pending = await dbRows(
    `events?user_id=eq.${encodeURIComponent(userId)}&sync_status=eq.pending` +
    '&or=(source_provider.is.null,source_provider.eq.google)&select=*',
  )
  let pushedEvents = 0
  let deletedEvents = 0
  for (const event of pending) {
    const source = event.external_source_id
      ? byId.get(event.external_source_id)
      : destination
    if (!source || source.sync_mode !== 'two_way' || !source.can_write) continue
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.external_id)}/events`
    try {
      if (event.deleted_at && event.external_id) {
        try {
          await request<void>(
            token,
            `${base}/${encodeURIComponent(event.external_id)}`,
            { method: 'DELETE' },
          )
        } catch (error) {
          if (!(error instanceof GoogleError) || error.status !== 404) throw error
        }
        await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'DELETE')
        deletedEvents++
        continue
      }
      if (event.deleted_at) continue
      const remote = event.external_id
        ? await request<JsonRecord>(
            token,
            `${base}/${encodeURIComponent(event.external_id)}`,
            { method: 'PATCH', body: JSON.stringify(eventPayload(event)) },
          )
        : await request<JsonRecord>(
            token,
            base,
            { method: 'POST', body: JSON.stringify(eventPayload(event)) },
          )
      const syncedAt = new Date().toISOString()
      await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'PATCH', {
        source_provider: 'google',
        external_source_id: source.external_id,
        external_id: remote.id,
        external_etag: remote.etag ?? null,
        external_url: remote.htmlLink ?? 'https://calendar.google.com/calendar/',
        external_updated_at: remote.updated ?? syncedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
        gcal_id: remote.id,
      })
      pushedEvents++
    } catch (error) {
      await markRowError('events', event.id)
      throw error
    }
  }
  return { pushedEvents, deletedEvents }
}

async function pushTasks(
  userId: string,
  token: string,
  sources: Source[],
): Promise<Partial<SyncResult>> {
  const writable = sources.filter(
    (source) => source.resource_type === 'task_list'
      && source.can_write
      && source.sync_mode === 'two_way',
  )
  const destination = writable.find((source) => source.is_default) ?? writable[0]
  const byId = new Map(sources.map((source) => [source.external_id, source]))
  const pending = await dbRows(
    `todos?user_id=eq.${encodeURIComponent(userId)}&sync_status=eq.pending` +
    '&or=(source_provider.is.null,source_provider.eq.google)&select=*',
  )
  let pushedTasks = 0
  let deletedTasks = 0
  for (const todo of pending) {
    const source = todo.external_source_id
      ? byId.get(todo.external_source_id)
      : destination
    if (!source || source.sync_mode !== 'two_way' || !source.can_write) continue
    const base = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(source.external_id)}/tasks`
    try {
      if (todo.deleted_at && todo.external_id) {
        try {
          await request<void>(
            token,
            `${base}/${encodeURIComponent(todo.external_id)}`,
            { method: 'DELETE' },
          )
        } catch (error) {
          if (!(error instanceof GoogleError) || error.status !== 404) throw error
        }
        await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'DELETE')
        deletedTasks++
        continue
      }
      if (todo.deleted_at) continue
      const remote = todo.external_id
        ? await request<JsonRecord>(
            token,
            `${base}/${encodeURIComponent(todo.external_id)}`,
            { method: 'PATCH', body: JSON.stringify(taskPayload(todo)) },
          )
        : await request<JsonRecord>(
            token,
            base,
            { method: 'POST', body: JSON.stringify(taskPayload(todo)) },
          )
      const syncedAt = new Date().toISOString()
      await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'PATCH', {
        source_provider: 'google',
        external_source_id: source.external_id,
        external_id: remote.id,
        external_etag: remote.etag ?? null,
        external_url: 'https://tasks.google.com/',
        external_updated_at: remote.updated ?? syncedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
      })
      pushedTasks++
    } catch (error) {
      await markRowError('todos', todo.id)
      throw error
    }
  }
  return { pushedTasks, deletedTasks }
}

function eventStart(event: JsonRecord): string | null {
  if (event.start?.dateTime) return new Date(event.start.dateTime).toISOString()
  if (event.start?.date) return new Date(`${event.start.date}T00:00:00`).toISOString()
  return null
}

function eventEnd(event: JsonRecord): string | null {
  if (event.end?.dateTime) return new Date(event.end.dateTime).toISOString()
  if (event.end?.date) return new Date(`${event.end.date}T00:00:00`).toISOString()
  return null
}

async function pullCalendar(
  userId: string,
  token: string,
  source: Source,
): Promise<Partial<SyncResult>> {
  const window = syncWindow()
  const buildUrl = (syncToken: string | null): string => {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.external_id)}/events`,
    )
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('showDeleted', 'true')
    url.searchParams.set('maxResults', '2500')
    if (syncToken) {
      url.searchParams.set('syncToken', syncToken)
    } else {
      url.searchParams.set('timeMin', window.start)
      url.searchParams.set('timeMax', window.end)
    }
    return url.toString()
  }

  let full = !source.sync_token
  let page: { items: JsonRecord[]; nextSyncToken: string | null }
  try {
    page = await pages(token, buildUrl(source.sync_token))
  } catch (error) {
    if (!(error instanceof GoogleError) || error.status !== 410) throw error
    full = true
    page = await pages(token, buildUrl(null))
  }

  const cancelled = page.items.filter((event) => event.status === 'cancelled')
  for (const event of cancelled) {
    await dbWrite(
      `events?user_id=eq.${encodeURIComponent(userId)}` +
      '&source_provider=eq.google' +
      `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
      `&external_id=eq.${encodeURIComponent(event.id)}`,
      'DELETE',
    )
  }
  const syncedAt = new Date().toISOString()
  const active = page.items.filter((event) => event.status !== 'cancelled' && eventStart(event))
  const rows = active.map((event) => ({
    user_id: userId,
    title: String(event.summary ?? '').trim() || '(제목 없음)',
    starts_at: eventStart(event),
    ends_at: eventEnd(event),
    kind: 'other',
    location: event.location ?? null,
    notes: null,
    source_provider: 'google',
    external_source_id: source.external_id,
    external_id: event.id,
    external_etag: event.etag ?? null,
    external_url: event.htmlLink ?? 'https://calendar.google.com/calendar/',
    external_updated_at: event.updated ?? null,
    last_synced_at: syncedAt,
    sync_status: 'synced',
    deleted_at: null,
    gcal_id: event.id,
  }))
  if (rows.length) {
    await dbWrite(
      'events?on_conflict=user_id,source_provider,external_source_id,external_id',
      'POST',
      rows,
      'resolution=merge-duplicates,return=minimal',
    )
  }

  let missingCount = 0
  if (full) {
    const local = await dbRows(
      `events?user_id=eq.${encodeURIComponent(userId)}` +
      '&source_provider=eq.google' +
      `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
      `&starts_at=gte.${encodeURIComponent(window.start)}` +
      `&starts_at=lt.${encodeURIComponent(window.end)}` +
      '&select=id,external_id',
    )
    const ids = new Set(active.map((event) => event.id))
    const missing = local.filter((event) => !ids.has(event.external_id))
    for (const event of missing) {
      await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'DELETE')
    }
    missingCount = missing.length
  }
  await markSourceSynced(source, { sync_token: page.nextSyncToken })
  return {
    importedEvents: rows.length,
    deletedEvents: cancelled.length + missingCount,
  }
}

async function pullTaskList(
  userId: string,
  token: string,
  source: Source,
): Promise<Partial<SyncResult>> {
  const url = new URL(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(source.external_id)}/tasks`,
  )
  url.searchParams.set('showCompleted', 'true')
  url.searchParams.set('showHidden', 'true')
  url.searchParams.set('showDeleted', 'true')
  url.searchParams.set('maxResults', '100')
  if (source.last_synced_at) {
    const overlap = new Date(new Date(source.last_synced_at).getTime() - 60_000)
    url.searchParams.set('updatedMin', overlap.toISOString())
  }
  const page = await pages<JsonRecord>(token, url.toString())
  const removed = page.items.filter((task) => task.deleted)
  for (const task of removed) {
    await dbWrite(
      `todos?user_id=eq.${encodeURIComponent(userId)}` +
      '&source_provider=eq.google' +
      `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
      `&external_id=eq.${encodeURIComponent(task.id)}`,
      'DELETE',
    )
  }
  const syncedAt = new Date().toISOString()
  const rows = page.items
    .filter((task) => !task.deleted)
    .map((task) => ({
      user_id: userId,
      title: String(task.title ?? '').trim() || '(제목 없음)',
      done: task.status === 'completed',
      due_date: typeof task.due === 'string' ? task.due.slice(0, 10) : null,
      due_time: null,
      priority: 'normal',
      source_provider: 'google',
      external_source_id: source.external_id,
      external_id: task.id,
      external_etag: task.etag ?? null,
      external_url: 'https://tasks.google.com/',
      external_updated_at: task.updated ?? null,
      last_synced_at: syncedAt,
      sync_status: 'synced',
      deleted_at: null,
    }))
  if (rows.length) {
    await dbWrite(
      'todos?on_conflict=user_id,source_provider,external_source_id,external_id',
      'POST',
      rows,
      'resolution=merge-duplicates,return=minimal',
    )
  }
  await markSourceSynced(source)
  return { importedTasks: rows.length, deletedTasks: removed.length }
}

export async function syncGoogle(
  userId: string,
  connection: JsonRecord,
  options: { discoverOnly?: boolean } = {},
): Promise<SyncResult> {
  const token = await accessToken(connection)
  const sources = await refreshSources(userId, connection.id, token)
  const result = emptyResult(sources.length)
  if (options.discoverOnly) return result
  if (connection.sync_mode === 'two_way') {
    mergeResult(result, await pushEvents(userId, token, sources))
    mergeResult(result, await pushTasks(userId, token, sources))
  }
  for (const source of sources.filter((item) => item.resource_type === 'calendar')) {
    mergeResult(result, await pullCalendar(userId, token, source))
  }
  for (const source of sources.filter((item) => item.resource_type === 'task_list')) {
    mergeResult(result, await pullTaskList(userId, token, source))
  }
  return result
}
