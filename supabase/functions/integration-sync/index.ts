// Server-side Microsoft Outlook Calendar + To Do synchronization.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GRAPH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
  'Tasks.ReadWrite',
]

type JsonRecord = Record<string, any>

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS })
}

function serviceHeaders(extra: HeadersInit = {}): Headers {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...Object.fromEntries(new Headers(extra)),
  })
}

async function database(path: string, init: RequestInit = {}): Promise<Response> {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) throw new Error('SERVER_CONFIG')
  return fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
  })
}

async function dbRows(path: string): Promise<JsonRecord[]> {
  const response = await database(path)
  if (!response.ok) throw new Error(`DATABASE_${response.status}`)
  const body = await response.json()
  return Array.isArray(body) ? body : []
}

async function dbWrite(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  prefer = 'return=minimal',
): Promise<JsonRecord[]> {
  const response = await database(path, {
    method,
    headers: { Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const message = await response.text()
    console.error('database write failed', response.status, message.slice(0, 300))
    throw new Error(`DATABASE_${response.status}`)
  }
  if (prefer.includes('return=representation')) {
    const value = await response.json()
    return Array.isArray(value) ? value : []
  }
  return []
}

async function authenticatedUser(req: Request): Promise<{ id: string } | null> {
  const authorization = req.headers.get('authorization')
  const base = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization || !base || !anonKey) return null
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: { authorization, apikey: anonKey },
  })
  if (!response.ok) return null
  const user = await response.json()
  return typeof user?.id === 'string' ? { id: user.id } : null
}

async function graph<T>(
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
  let body: any = null
  try {
    body = await response.json()
  } catch {
    // Successful deletes have no body.
  }
  if (!response.ok) {
    const code = body?.error?.code ?? response.status
    const message = body?.error?.message ?? 'Microsoft Graph request failed'
    throw new Error(`GRAPH_${code}:${message}`)
  }
  return body as T
}

async function graphAll<T>(
  accessToken: string,
  firstUrl: string,
  headers: HeadersInit = {},
): Promise<T[]> {
  const rows: T[] = []
  let next: string | null = firstUrl
  while (next) {
    const page: { value?: T[]; '@odata.nextLink'?: string } = await graph(
      accessToken,
      next,
      { headers },
    )
    rows.push(...(page.value ?? []))
    next = page['@odata.nextLink'] ?? null
  }
  return rows
}

async function refreshMicrosoftToken(
  connection: JsonRecord,
  credentials: JsonRecord,
): Promise<string> {
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
        scope: GRAPH_SCOPES.join(' '),
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

  await dbWrite(
    `integration_credentials?connection_id=eq.${encodeURIComponent(connection.id)}`,
    'PATCH',
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? credentials.refresh_token,
      token_type: tokens.token_type ?? 'Bearer',
      expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      scope: tokens.scope ?? credentials.scope,
      updated_at: new Date().toISOString(),
    },
  )
  return tokens.access_token
}

interface Source {
  id: string
  external_id: string
  resource_type: 'calendar' | 'task_list'
  selected: boolean
  is_default: boolean
  can_write: boolean
}

async function refreshSources(
  userId: string,
  connectionId: string,
  accessToken: string,
): Promise<Source[]> {
  const [calendars, taskLists, existing] = await Promise.all([
    graphAll<JsonRecord>(
      accessToken,
      'https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,color,canEdit,isDefaultCalendar&$top=100',
    ),
    graphAll<JsonRecord>(
      accessToken,
      'https://graph.microsoft.com/v1.0/me/todo/lists?$select=id,displayName,wellknownListName,isOwner&$top=100',
    ),
    dbRows(
      `integration_sources?user_id=eq.${encodeURIComponent(userId)}&provider=eq.microsoft&select=*`,
    ),
  ])
  const existingByIdentity = new Map(
    existing.map((source) => [`${source.resource_type}:${source.external_id}`, source]),
  )
  const selectedCalendarExists = existing.some(
    (source) => source.resource_type === 'calendar' && source.selected,
  )
  const selectedTaskListExists = existing.some(
    (source) => source.resource_type === 'task_list' && source.selected,
  )
  const rows = [
    ...calendars.map((calendar) => {
      const previous = existingByIdentity.get(`calendar:${calendar.id}`)
      return {
        user_id: userId,
        connection_id: connectionId,
        provider: 'microsoft',
        resource_type: 'calendar',
        external_id: calendar.id,
        name: calendar.name ?? 'Outlook Calendar',
        color: calendar.color ?? null,
        selected: previous?.selected ?? (!selectedCalendarExists && Boolean(calendar.isDefaultCalendar)),
        is_default: Boolean(calendar.isDefaultCalendar),
        can_write: calendar.canEdit !== false,
        last_error: null,
      }
    }),
    ...taskLists.map((list, index) => {
      const previous = existingByIdentity.get(`task_list:${list.id}`)
      const isDefault = list.wellknownListName === 'defaultList' || index === 0
      return {
        user_id: userId,
        connection_id: connectionId,
        provider: 'microsoft',
        resource_type: 'task_list',
        external_id: list.id,
        name: list.displayName ?? 'Microsoft To Do',
        color: null,
        selected: previous?.selected ?? (!selectedTaskListExists && isDefault),
        is_default: isDefault,
        can_write: list.isOwner !== false,
        last_error: null,
      }
    }),
  ]
  if (rows.length > 0) {
    await dbWrite(
      'integration_sources?on_conflict=user_id,provider,resource_type,external_id',
      'POST',
      rows,
      'resolution=merge-duplicates,return=minimal',
    )
  }
  return await dbRows(
    `integration_sources?user_id=eq.${encodeURIComponent(userId)}&provider=eq.microsoft&select=*`,
  ) as Source[]
}

function graphDateTime(iso: string): { dateTime: string; timeZone: string } {
  return {
    dateTime: new Date(iso).toISOString().replace(/Z$/, ''),
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

async function pushPendingEvents(
  userId: string,
  accessToken: string,
  destination?: Source,
): Promise<{ pushed: number; deleted: number }> {
  const pending = await dbRows(
    `events?user_id=eq.${encodeURIComponent(userId)}&sync_status=eq.pending` +
    '&or=(source_provider.is.null,source_provider.eq.microsoft)&select=*',
  )
  let pushed = 0
  let deleted = 0
  for (const event of pending) {
    if (!event.external_id && !destination?.can_write) continue
    const calendarId = event.external_source_id ?? destination?.external_id
    if (!calendarId) continue
    const base = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`
    try {
      if (event.deleted_at && event.external_id) {
        try {
          await graph<void>(
            accessToken,
            `${base}/${encodeURIComponent(event.external_id)}`,
            { method: 'DELETE' },
          )
        } catch (error) {
          if (!(error instanceof Error) || !error.message.startsWith('GRAPH_ErrorItemNotFound')) {
            throw error
          }
        }
        await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'DELETE')
        deleted++
        continue
      }
      if (event.deleted_at) continue

      const remote = event.external_id
        ? await graph<JsonRecord>(
            accessToken,
            `${base}/${encodeURIComponent(event.external_id)}`,
            { method: 'PATCH', body: JSON.stringify(eventPayload(event)) },
          )
        : await graph<JsonRecord>(
            accessToken,
            base,
            { method: 'POST', body: JSON.stringify(eventPayload(event)) },
          )
      const syncedAt = new Date().toISOString()
      await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'PATCH', {
        source_provider: 'microsoft',
        external_source_id: calendarId,
        external_id: remote.id,
        external_etag: remote.changeKey ?? null,
        external_url: remote.webLink ?? null,
        external_updated_at: remote.lastModifiedDateTime ?? syncedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
      })
      pushed++
    } catch (error) {
      await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'PATCH', {
        sync_status: 'error',
      })
      throw error
    }
  }
  return { pushed, deleted }
}

async function pushPendingTasks(
  userId: string,
  accessToken: string,
  destination?: Source,
): Promise<{ pushed: number; deleted: number }> {
  const pending = await dbRows(
    `todos?user_id=eq.${encodeURIComponent(userId)}&sync_status=eq.pending` +
    '&or=(source_provider.is.null,source_provider.eq.microsoft)&select=*',
  )
  let pushed = 0
  let deleted = 0
  for (const todo of pending) {
    if (!todo.external_id && !destination?.can_write) continue
    const listId = todo.external_source_id ?? destination?.external_id
    if (!listId) continue
    const base = `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(listId)}/tasks`
    try {
      if (todo.deleted_at && todo.external_id) {
        try {
          await graph<void>(
            accessToken,
            `${base}/${encodeURIComponent(todo.external_id)}`,
            { method: 'DELETE' },
          )
        } catch (error) {
          if (!(error instanceof Error) || !error.message.startsWith('GRAPH_itemNotFound')) {
            throw error
          }
        }
        await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'DELETE')
        deleted++
        continue
      }
      if (todo.deleted_at) continue

      const remote = todo.external_id
        ? await graph<JsonRecord>(
            accessToken,
            `${base}/${encodeURIComponent(todo.external_id)}`,
            { method: 'PATCH', body: JSON.stringify(taskPayload(todo)) },
          )
        : await graph<JsonRecord>(
            accessToken,
            base,
            { method: 'POST', body: JSON.stringify(taskPayload(todo)) },
          )
      const syncedAt = new Date().toISOString()
      await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'PATCH', {
        source_provider: 'microsoft',
        external_source_id: listId,
        external_id: remote.id,
        external_etag: remote['@odata.etag'] ?? null,
        external_url: null,
        external_updated_at: remote.lastModifiedDateTime ?? syncedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
      })
      pushed++
    } catch (error) {
      await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'PATCH', {
        sync_status: 'error',
      })
      throw error
    }
  }
  return { pushed, deleted }
}

function utcIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

async function pullCalendar(
  userId: string,
  accessToken: string,
  source: Source,
  timeMin: string,
  timeMax: string,
): Promise<{ imported: number; deleted: number }> {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(source.external_id)}/calendarView`,
  )
  url.searchParams.set('startDateTime', timeMin)
  url.searchParams.set('endDateTime', timeMax)
  url.searchParams.set('$top', '1000')
  url.searchParams.set(
    '$select',
    'id,subject,start,end,location,webLink,changeKey,lastModifiedDateTime,isCancelled',
  )
  const remote = await graphAll<JsonRecord>(
    accessToken,
    url.toString(),
    { Prefer: 'outlook.timezone="UTC"' },
  )
  const active = remote.filter((event) => !event.isCancelled && utcIso(event.start?.dateTime))
  const syncedAt = new Date().toISOString()
  const rows = active.map((event) => ({
    user_id: userId,
    title: String(event.subject ?? '').trim() || '(제목 없음)',
    starts_at: utcIso(event.start?.dateTime),
    ends_at: utcIso(event.end?.dateTime),
    kind: 'other',
    location: event.location?.displayName ?? null,
    notes: null,
    source_provider: 'microsoft',
    external_source_id: source.external_id,
    external_id: event.id,
    external_etag: event.changeKey ?? null,
    external_url: event.webLink ?? null,
    external_updated_at: event.lastModifiedDateTime ?? null,
    last_synced_at: syncedAt,
    sync_status: 'synced',
    deleted_at: null,
  }))
  if (rows.length > 0) {
    await dbWrite(
      'events?on_conflict=user_id,source_provider,external_source_id,external_id',
      'POST',
      rows,
      'resolution=merge-duplicates,return=minimal',
    )
  }

  const local = await dbRows(
    `events?user_id=eq.${encodeURIComponent(userId)}` +
    '&source_provider=eq.microsoft' +
    `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
    `&starts_at=gte.${encodeURIComponent(timeMin)}` +
    `&starts_at=lt.${encodeURIComponent(timeMax)}` +
    '&select=id,external_id',
  )
  const remoteIds = new Set(active.map((event) => event.id))
  const missing = local.filter((event) => !remoteIds.has(event.external_id))
  for (const event of missing) {
    await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'DELETE')
  }
  await dbWrite(
    `integration_sources?id=eq.${encodeURIComponent(source.id)}`,
    'PATCH',
    { last_synced_at: syncedAt, last_error: null },
  )
  return { imported: rows.length, deleted: missing.length }
}

async function pullTaskList(
  userId: string,
  accessToken: string,
  source: Source,
): Promise<{ imported: number; deleted: number }> {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(source.external_id)}/tasks`,
  )
  url.searchParams.set('$top', '100')
  url.searchParams.set(
    '$select',
    'id,title,status,dueDateTime,lastModifiedDateTime',
  )
  const remote = await graphAll<JsonRecord>(accessToken, url.toString())
  const syncedAt = new Date().toISOString()
  const rows = remote.map((task) => ({
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
    external_url: null,
    external_updated_at: task.lastModifiedDateTime ?? null,
    last_synced_at: syncedAt,
    sync_status: 'synced',
    deleted_at: null,
  }))
  if (rows.length > 0) {
    await dbWrite(
      'todos?on_conflict=user_id,source_provider,external_source_id,external_id',
      'POST',
      rows,
      'resolution=merge-duplicates,return=minimal',
    )
  }

  const local = await dbRows(
    `todos?user_id=eq.${encodeURIComponent(userId)}` +
    '&source_provider=eq.microsoft' +
    `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
    '&select=id,external_id',
  )
  const remoteIds = new Set(remote.map((task) => task.id))
  const missing = local.filter((task) => !remoteIds.has(task.external_id))
  for (const task of missing) {
    await dbWrite(`todos?id=eq.${encodeURIComponent(task.id)}`, 'DELETE')
  }
  await dbWrite(
    `integration_sources?id=eq.${encodeURIComponent(source.id)}`,
    'PATCH',
    { last_synced_at: syncedAt, last_error: null },
  )
  return { imported: rows.length, deleted: missing.length }
}

async function synchronize(userId: string): Promise<JsonRecord> {
  const connections = await dbRows(
    `integration_connections?user_id=eq.${encodeURIComponent(userId)}` +
    '&provider=eq.microsoft&status=eq.active&select=*&limit=1',
  )
  const connection = connections[0]
  if (!connection) throw new Error('MICROSOFT_NOT_CONNECTED')
  const credentials = (await dbRows(
    `integration_credentials?connection_id=eq.${encodeURIComponent(connection.id)}&select=*`,
  ))[0]
  if (!credentials) throw new Error('MICROSOFT_RECONNECT_REQUIRED')

  const accessToken = await refreshMicrosoftToken(connection, credentials)
  const sources = await refreshSources(userId, connection.id, accessToken)
  const selected = sources.filter((source) => source.selected)
  const calendars = selected.filter((source) => source.resource_type === 'calendar')
  const taskLists = selected.filter((source) => source.resource_type === 'task_list')
  const destinationCalendar = calendars.find((source) => source.is_default && source.can_write)
    ?? calendars.find((source) => source.can_write)
  const destinationTaskList = taskLists.find((source) => source.is_default && source.can_write)
    ?? taskLists.find((source) => source.can_write)

  const eventPush = await pushPendingEvents(userId, accessToken, destinationCalendar)
  const taskPush = await pushPendingTasks(userId, accessToken, destinationTaskList)

  const timeMinDate = new Date()
  const timeMaxDate = new Date()
  timeMinDate.setDate(timeMinDate.getDate() - 90)
  timeMaxDate.setFullYear(timeMaxDate.getFullYear() + 1)
  const timeMin = timeMinDate.toISOString()
  const timeMax = timeMaxDate.toISOString()

  let importedEvents = 0
  let importedTasks = 0
  let deletedEvents = eventPush.deleted
  let deletedTasks = taskPush.deleted
  for (const source of calendars) {
    const result = await pullCalendar(userId, accessToken, source, timeMin, timeMax)
    importedEvents += result.imported
    deletedEvents += result.deleted
  }
  for (const source of taskLists) {
    const result = await pullTaskList(userId, accessToken, source)
    importedTasks += result.imported
    deletedTasks += result.deleted
  }

  const syncedAt = new Date().toISOString()
  await dbWrite(
    `integration_connections?id=eq.${encodeURIComponent(connection.id)}`,
    'PATCH',
    { status: 'active', last_synced_at: syncedAt, last_error: null },
  )
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const user = await authenticatedUser(req)
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401)
  try {
    const body = await req.json().catch(() => ({}))
    if (body.provider !== 'microsoft') {
      return json({ error: '지원하지 않는 동기화 제공자입니다.' }, 400)
    }
    return json(await synchronize(user.id))
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    console.error('integration-sync failed', code)
    if (code === 'MICROSOFT_NOT_CONNECTED') {
      return json({ error: 'Microsoft 계정이 연결되어 있지 않습니다.' }, 409)
    }
    if (code === 'MICROSOFT_RECONNECT_REQUIRED') {
      return json({ error: 'Microsoft 연결이 만료되었습니다. 다시 연결해주세요.' }, 401)
    }
    if (code === 'MICROSOFT_OAUTH_NOT_CONFIGURED') {
      return json({ error: 'Microsoft OAuth 설정이 아직 완료되지 않았습니다.' }, 503)
    }
    return json({ error: 'Microsoft 일정과 할 일 동기화에 실패했습니다.' }, 502)
  }
})
