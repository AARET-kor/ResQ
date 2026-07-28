import {
  dbRows,
  dbWrite,
  readCredentials,
  storeCredentials,
  type JsonRecord,
} from '../_shared/integration.ts'
import {
  emptyResult,
  iso,
  markRowError,
  markSourceSynced,
  mergeResult,
  selectedSources,
  syncWindow,
  type Source,
  type SyncResult,
} from './common.ts'

const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
  'Tasks.ReadWrite',
]

class GraphError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

async function graph<T>(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new GraphError(
      response.status,
      body?.error?.code ?? String(response.status),
      body?.error?.message ?? `Microsoft Graph ${response.status}`,
    )
  }
  return body as T
}

async function graphPages<T>(
  token: string,
  firstUrl: string,
  headers: HeadersInit = {},
): Promise<{ items: T[]; deltaLink: string | null }> {
  const items: T[] = []
  let next: string | null = firstUrl
  let deltaLink: string | null = null
  while (next) {
    const page: {
      value?: T[]
      '@odata.nextLink'?: string
      '@odata.deltaLink'?: string
    } = await graph(token, next, { headers })
    items.push(...(page.value ?? []))
    deltaLink = page['@odata.deltaLink'] ?? deltaLink
    next = page['@odata.nextLink'] ?? null
  }
  return { items, deltaLink }
}

async function accessToken(connection: JsonRecord): Promise<string> {
  const credentials = await readCredentials(connection.id)
  if (!credentials) throw new Error('MICROSOFT_RECONNECT_REQUIRED')
  const expiresAt = credentials.expires_at
    ? new Date(credentials.expires_at).getTime()
    : 0
  if (expiresAt > Date.now() + 120_000) return credentials.access_token
  if (!credentials.refresh_token) throw new Error('MICROSOFT_RECONNECT_REQUIRED')
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('MICROSOFT_OAUTH_NOT_CONFIGURED')
  const response = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
        scope: SCOPES.join(' '),
      }),
    },
  )
  const tokens = await response.json()
  if (!response.ok || typeof tokens.access_token !== 'string') {
    await dbWrite(
      `integration_connections?id=eq.${encodeURIComponent(connection.id)}`,
      'PATCH',
      { status: 'expired', last_error: 'Microsoft 연결을 다시 승인해주세요.' },
    )
    throw new Error('MICROSOFT_RECONNECT_REQUIRED')
  }
  await storeCredentials(connection.id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? credentials.refresh_token,
    token_type: tokens.token_type ?? 'Bearer',
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
    graphPages<JsonRecord>(
      token,
      'https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,color,canEdit,isDefaultCalendar&$top=100',
    ),
    graphPages<JsonRecord>(
      token,
      'https://graph.microsoft.com/v1.0/me/todo/lists?$select=id,displayName,wellknownListName,isOwner&$top=100',
    ),
    dbRows(
      `integration_sources?user_id=eq.${encodeURIComponent(userId)}` +
      '&provider=eq.microsoft&select=*',
    ),
  ])
  const previous = new Map(
    existing.map((source) => [`${source.resource_type}:${source.external_id}`, source]),
  )
  const hasCalendar = existing.some((source) => source.resource_type === 'calendar' && source.selected)
  const hasTasks = existing.some((source) => source.resource_type === 'task_list' && source.selected)
  const rows = [
    ...calendarPage.items.map((calendar, index) => {
      const prior = previous.get(`calendar:${calendar.id}`)
      const writable = calendar.canEdit !== false
      return {
        user_id: userId,
        connection_id: connectionId,
        provider: 'microsoft',
        resource_type: 'calendar',
        external_id: calendar.id,
        name: calendar.name ?? 'Outlook Calendar',
        color: calendar.color ?? null,
        selected: prior?.selected ?? (!hasCalendar && (calendar.isDefaultCalendar || index === 0)),
        is_default: Boolean(calendar.isDefaultCalendar),
        can_write: writable,
        sync_mode: prior?.sync_mode ?? (writable ? 'two_way' : 'read_only'),
        sync_token: prior?.sync_token ?? null,
        metadata: {
          ...(prior?.metadata ?? {}),
          web_url: 'https://outlook.office.com/calendar/',
        },
        last_synced_at: prior?.last_synced_at ?? null,
        last_error: null,
      }
    }),
    ...taskListPage.items.map((list, index) => {
      const prior = previous.get(`task_list:${list.id}`)
      const isDefault = list.wellknownListName === 'defaultList' || index === 0
      const writable = list.isOwner !== false
      return {
        user_id: userId,
        connection_id: connectionId,
        provider: 'microsoft',
        resource_type: 'task_list',
        external_id: list.id,
        name: list.displayName ?? 'Microsoft To Do',
        color: null,
        selected: prior?.selected ?? (!hasTasks && isDefault),
        is_default: isDefault,
        can_write: writable,
        sync_mode: prior?.sync_mode ?? (writable ? 'two_way' : 'read_only'),
        sync_token: prior?.sync_token ?? null,
        metadata: {
          ...(prior?.metadata ?? {}),
          web_url: 'https://to-do.office.com/tasks/',
        },
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
  return await selectedSources(userId, 'microsoft')
}

function graphDateTime(value: string): JsonRecord {
  return {
    dateTime: new Date(value).toISOString().replace(/Z$/, ''),
    timeZone: 'UTC',
  }
}

function eventPayload(event: JsonRecord): JsonRecord {
  const end = event.ends_at
    ?? new Date(new Date(event.starts_at).getTime() + 3_600_000).toISOString()
  return {
    subject: event.title,
    start: graphDateTime(event.starts_at),
    end: graphDateTime(end),
    location: event.location ? { displayName: event.location } : undefined,
    isReminderOn: true,
    reminderMinutesBeforeStart: 30,
  }
}

function taskPayload(todo: JsonRecord): JsonRecord {
  return {
    title: todo.title,
    status: todo.done ? 'completed' : 'notStarted',
    dueDateTime: todo.due_date
      ? { dateTime: `${todo.due_date}T00:00:00.0000000`, timeZone: 'UTC' }
      : null,
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
    '&or=(source_provider.is.null,source_provider.eq.microsoft)&select=*',
  )
  let pushedEvents = 0
  let deletedEvents = 0
  for (const event of pending) {
    const source = event.external_source_id ? byId.get(event.external_source_id) : destination
    if (!source || source.sync_mode !== 'two_way' || !source.can_write) continue
    const base = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(source.external_id)}/events`
    try {
      if (event.deleted_at && event.external_id) {
        try {
          await graph<void>(
            token,
            `${base}/${encodeURIComponent(event.external_id)}`,
            { method: 'DELETE' },
          )
        } catch (error) {
          if (!(error instanceof GraphError) || error.status !== 404) throw error
        }
        await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'DELETE')
        deletedEvents++
        continue
      }
      if (event.deleted_at) continue
      const remote = event.external_id
        ? await graph<JsonRecord>(
            token,
            `${base}/${encodeURIComponent(event.external_id)}`,
            { method: 'PATCH', body: JSON.stringify(eventPayload(event)) },
          )
        : await graph<JsonRecord>(
            token,
            base,
            { method: 'POST', body: JSON.stringify(eventPayload(event)) },
          )
      const syncedAt = new Date().toISOString()
      await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'PATCH', {
        source_provider: 'microsoft',
        external_source_id: source.external_id,
        external_id: remote.id,
        external_etag: remote.changeKey ?? null,
        external_url: remote.webLink ?? 'https://outlook.office.com/calendar/',
        external_updated_at: remote.lastModifiedDateTime ?? syncedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
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
    '&or=(source_provider.is.null,source_provider.eq.microsoft)&select=*',
  )
  let pushedTasks = 0
  let deletedTasks = 0
  for (const todo of pending) {
    const source = todo.external_source_id ? byId.get(todo.external_source_id) : destination
    if (!source || source.sync_mode !== 'two_way' || !source.can_write) continue
    const base = `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(source.external_id)}/tasks`
    try {
      if (todo.deleted_at && todo.external_id) {
        try {
          await graph<void>(
            token,
            `${base}/${encodeURIComponent(todo.external_id)}`,
            { method: 'DELETE' },
          )
        } catch (error) {
          if (!(error instanceof GraphError) || error.status !== 404) throw error
        }
        await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'DELETE')
        deletedTasks++
        continue
      }
      if (todo.deleted_at) continue
      const remote = todo.external_id
        ? await graph<JsonRecord>(
            token,
            `${base}/${encodeURIComponent(todo.external_id)}`,
            { method: 'PATCH', body: JSON.stringify(taskPayload(todo)) },
          )
        : await graph<JsonRecord>(
            token,
            base,
            { method: 'POST', body: JSON.stringify(taskPayload(todo)) },
          )
      const syncedAt = new Date().toISOString()
      await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'PATCH', {
        source_provider: 'microsoft',
        external_source_id: source.external_id,
        external_id: remote.id,
        external_etag: remote['@odata.etag'] ?? null,
        external_url: 'https://to-do.office.com/tasks/',
        external_updated_at: remote.lastModifiedDateTime ?? syncedAt,
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

async function pullCalendar(
  userId: string,
  token: string,
  source: Source,
): Promise<Partial<SyncResult>> {
  const range = syncWindow()
  const initial = new URL(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(source.external_id)}/calendarView/delta`,
  )
  initial.searchParams.set('startDateTime', range.start)
  initial.searchParams.set('endDateTime', range.end)
  let full = !source.sync_token
  let page: { items: JsonRecord[]; deltaLink: string | null }
  try {
    page = await graphPages(
      token,
      source.sync_token ?? initial.toString(),
      { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=1000' },
    )
  } catch (error) {
    if (!(error instanceof GraphError) || ![404, 410].includes(error.status)) throw error
    full = true
    page = await graphPages(
      token,
      initial.toString(),
      { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=1000' },
    )
  }
  const removed = page.items.filter((event) => event['@removed'] || event.isCancelled)
  for (const event of removed) {
    await dbWrite(
      `events?user_id=eq.${encodeURIComponent(userId)}` +
      '&source_provider=eq.microsoft' +
      `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
      `&external_id=eq.${encodeURIComponent(event.id)}`,
      'DELETE',
    )
  }
  const active = page.items.filter(
    (event) => !event['@removed'] && !event.isCancelled && iso(event.start?.dateTime),
  )
  const syncedAt = new Date().toISOString()
  const rows = active.map((event) => ({
    user_id: userId,
    title: String(event.subject ?? '').trim() || '(제목 없음)',
    starts_at: iso(event.start?.dateTime),
    ends_at: iso(event.end?.dateTime),
    kind: 'other',
    location: event.location?.displayName ?? null,
    notes: null,
    source_provider: 'microsoft',
    external_source_id: source.external_id,
    external_id: event.id,
    external_etag: event.changeKey ?? null,
    external_url: event.webLink ?? 'https://outlook.office.com/calendar/',
    external_updated_at: event.lastModifiedDateTime ?? null,
    last_synced_at: syncedAt,
    sync_status: 'synced',
    deleted_at: null,
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
      '&source_provider=eq.microsoft' +
      `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
      `&starts_at=gte.${encodeURIComponent(range.start)}` +
      `&starts_at=lt.${encodeURIComponent(range.end)}` +
      '&select=id,external_id',
    )
    const ids = new Set(active.map((event) => event.id))
    const missing = local.filter((event) => !ids.has(event.external_id))
    for (const event of missing) {
      await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'DELETE')
    }
    missingCount = missing.length
  }
  await markSourceSynced(source, { sync_token: page.deltaLink })
  return {
    importedEvents: rows.length,
    deletedEvents: removed.length + missingCount,
  }
}

async function pullTaskList(
  userId: string,
  token: string,
  source: Source,
): Promise<Partial<SyncResult>> {
  const initial = new URL(
    `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(source.external_id)}/tasks/delta`,
  )
  initial.searchParams.set('$top', '100')
  let full = !source.sync_token
  let page: { items: JsonRecord[]; deltaLink: string | null }
  try {
    page = await graphPages(token, source.sync_token ?? initial.toString())
  } catch (error) {
    if (!(error instanceof GraphError) || ![400, 404, 410].includes(error.status)) throw error
    full = true
    const fallback = new URL(
      `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(source.external_id)}/tasks`,
    )
    fallback.searchParams.set('$top', '100')
    page = await graphPages(token, fallback.toString())
  }
  const removed = page.items.filter((task) => task['@removed'])
  for (const task of removed) {
    await dbWrite(
      `todos?user_id=eq.${encodeURIComponent(userId)}` +
      '&source_provider=eq.microsoft' +
      `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
      `&external_id=eq.${encodeURIComponent(task.id)}`,
      'DELETE',
    )
  }
  const active = page.items.filter((task) => !task['@removed'])
  const syncedAt = new Date().toISOString()
  const rows = active.map((task) => ({
    user_id: userId,
    title: String(task.title ?? '').trim() || '(제목 없음)',
    done: task.status === 'completed',
    due_date: typeof task.dueDateTime?.dateTime === 'string'
      ? task.dueDateTime.dateTime.slice(0, 10)
      : null,
    due_time: null,
    priority: 'normal',
    source_provider: 'microsoft',
    external_source_id: source.external_id,
    external_id: task.id,
    external_etag: task['@odata.etag'] ?? null,
    external_url: 'https://to-do.office.com/tasks/',
    external_updated_at: task.lastModifiedDateTime ?? null,
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
  let missingCount = 0
  if (full) {
    const local = await dbRows(
      `todos?user_id=eq.${encodeURIComponent(userId)}` +
      '&source_provider=eq.microsoft' +
      `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
      '&select=id,external_id',
    )
    const ids = new Set(active.map((task) => task.id))
    const missing = local.filter((task) => !ids.has(task.external_id))
    for (const task of missing) {
      await dbWrite(`todos?id=eq.${encodeURIComponent(task.id)}`, 'DELETE')
    }
    missingCount = missing.length
  }
  await markSourceSynced(source, { sync_token: page.deltaLink })
  return {
    importedTasks: rows.length,
    deletedTasks: removed.length + missingCount,
  }
}

export async function syncMicrosoft(
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
