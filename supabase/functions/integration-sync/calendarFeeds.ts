import {
  dbRows,
  dbWrite,
  readCredentials,
  validateRemoteHttpsUrl,
  type JsonRecord,
} from '../_shared/integration.ts'
import {
  buildEventCalendar,
  buildTaskCalendar,
  parseCalendar,
} from '../_shared/ical.ts'
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

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function xmlValue(block: string, localName: string): string | null {
  const expression = new RegExp(
    `<(?:[\\w-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localName}>`,
    'i',
  )
  const match = block.match(expression)
  return match ? decodeXml(match[1].trim()) : null
}

function responseBlocks(xml: string): string[] {
  return [...xml.matchAll(
    /<(?:[\w-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi,
  )].map((match) => match[1])
}

function basicAuthorization(username: string | null, password: string): string {
  return `Basic ${btoa(`${username ?? ''}:${password}`)}`
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('REMOTE_DOCUMENT_TOO_LARGE')
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

async function remoteFetch(
  initialUrl: URL,
  init: RequestInit,
  maxBytes = 5_000_000,
): Promise<{ response: Response; body: string; finalUrl: URL }> {
  let url = initialUrl
  for (let redirects = 0; redirects <= 3; redirects++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        const next = location ? validateRemoteHttpsUrl(new URL(location, url).toString()) : null
        await response.body?.cancel()
        if (!next) throw new Error('UNSAFE_REDIRECT')
        url = next
        continue
      }
      const length = Number(response.headers.get('content-length') ?? 0)
      if (length > maxBytes) {
        await response.body?.cancel()
        throw new Error('REMOTE_DOCUMENT_TOO_LARGE')
      }
      const body = await readLimitedText(response, maxBytes)
      return { response, body, finalUrl: url }
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error('TOO_MANY_REDIRECTS')
}

async function upsertParsed(
  userId: string,
  provider: 'ics' | 'caldav',
  source: Source,
  calendarText: string,
  resourceId: string,
  etag: string | null,
): Promise<{ eventIds: string[]; taskIds: string[]; events: number; tasks: number }> {
  const parsed = parseCalendar(calendarText)
  const syncedAt = new Date().toISOString()
  const eventRows = source.resource_type === 'calendar'
    ? parsed.events
      .filter((event) => !event.cancelled)
      .map((event) => ({
        user_id: userId,
        title: event.title,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        kind: 'other',
        location: event.location,
        notes: null,
        source_provider: provider,
        external_source_id: source.external_id,
        external_id: resourceId === 'feed' ? event.uid : resourceId,
        external_etag: etag,
        external_url: source.metadata?.web_url ?? null,
        external_updated_at: event.updatedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
        deleted_at: null,
      }))
    : []
  const taskRows = source.resource_type === 'task_list'
    ? parsed.tasks
      .filter((task) => !task.cancelled)
      .map((task) => {
        const due = task.dueAt ? new Date(task.dueAt) : null
        return {
          user_id: userId,
          title: task.title,
          done: task.completed,
          due_date: due && !Number.isNaN(due.getTime()) ? due.toISOString().slice(0, 10) : null,
          due_time: due && !Number.isNaN(due.getTime()) ? due.toISOString().slice(11, 16) : null,
          priority: 'normal',
          source_provider: provider,
          external_source_id: source.external_id,
          external_id: resourceId === 'feed' ? task.uid : resourceId,
          external_etag: etag,
          external_url: source.metadata?.web_url ?? null,
          external_updated_at: task.updatedAt,
          last_synced_at: syncedAt,
          sync_status: 'synced',
          deleted_at: null,
        }
      })
    : []
  if (eventRows.length) {
    await dbWrite(
      'events?on_conflict=user_id,source_provider,external_source_id,external_id',
      'POST',
      eventRows,
      'resolution=merge-duplicates,return=minimal',
    )
  }
  if (taskRows.length) {
    await dbWrite(
      'todos?on_conflict=user_id,source_provider,external_source_id,external_id',
      'POST',
      taskRows,
      'resolution=merge-duplicates,return=minimal',
    )
  }
  return {
    eventIds: eventRows.map((row) => row.external_id),
    taskIds: taskRows.map((row) => row.external_id),
    events: eventRows.length,
    tasks: taskRows.length,
  }
}

export async function syncIcs(
  userId: string,
  connection: JsonRecord,
): Promise<SyncResult> {
  const credentials = await readCredentials(connection.id)
  const endpoint = validateRemoteHttpsUrl(credentials?.endpoint_url)
  if (!endpoint) throw new Error('ICS_ENDPOINT_INVALID')
  const sources = await selectedSources(userId, 'ics')
  const result = emptyResult(sources.length)
  const fetched = await remoteFetch(endpoint, {
    method: 'GET',
    headers: { accept: 'text/calendar, text/plain;q=0.9' },
  })
  if (!fetched.response.ok) throw new Error(`ICS_${fetched.response.status}`)
  for (const source of sources) {
    const parsed = await upsertParsed(userId, 'ics', source, fetched.body, 'feed', null)
    result.importedEvents += parsed.events
    result.importedTasks += parsed.tasks
    const table = source.resource_type === 'calendar' ? 'events' : 'todos'
    const ids = source.resource_type === 'calendar' ? parsed.eventIds : parsed.taskIds
    const local = await dbRows(
      `${table}?user_id=eq.${encodeURIComponent(userId)}` +
      '&source_provider=eq.ics' +
      `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
      '&select=id,external_id',
    )
    const current = new Set(ids)
    const missing = local.filter((row) => !current.has(row.external_id))
    for (const row of missing) {
      await dbWrite(`${table}?id=eq.${encodeURIComponent(row.id)}`, 'DELETE')
    }
    if (table === 'events') result.deletedEvents += missing.length
    else result.deletedTasks += missing.length
    await markSourceSynced(source)
  }
  return result
}

async function discoverCalDavSources(
  userId: string,
  connection: JsonRecord,
  endpoint: URL,
  authorization: string,
): Promise<Source[]> {
  const propfind = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"
 xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <c:supported-calendar-component-set/>
    <cs:getctag/>
  </d:prop>
</d:propfind>`
  const fetched = await remoteFetch(endpoint, {
    method: 'PROPFIND',
    headers: {
      Authorization: authorization,
      Depth: '1',
      'content-type': 'application/xml; charset=utf-8',
    },
    body: propfind,
  })
  if (![200, 207].includes(fetched.response.status)) {
    throw new Error(`CALDAV_DISCOVERY_${fetched.response.status}`)
  }
  const existing = await dbRows(
    `integration_sources?user_id=eq.${encodeURIComponent(userId)}` +
    '&provider=eq.caldav&select=*',
  )
  const previous = new Map(
    existing.map((source) => [`${source.resource_type}:${source.external_id}`, source]),
  )
  const discovered: Array<{
    href: string
    name: string
    resourceType: 'calendar' | 'task_list'
  }> = []
  for (const block of responseBlocks(fetched.body)) {
    if (!/<(?:[\w-]+:)?calendar(?:\s|\/|>)/i.test(block)) continue
    const hrefValue = xmlValue(block, 'href')
    if (!hrefValue) continue
    const href = validateRemoteHttpsUrl(new URL(hrefValue, fetched.finalUrl).toString())
    if (!href) continue
    const name = xmlValue(block, 'displayname') || connection.account_label || href.hostname
    const supportsTodo = /name\s*=\s*["']VTODO["']/i.test(block)
    const supportsEvent = /name\s*=\s*["']VEVENT["']/i.test(block) || !supportsTodo
    if (supportsEvent) discovered.push({ href: href.toString(), name, resourceType: 'calendar' })
    if (supportsTodo) discovered.push({ href: href.toString(), name, resourceType: 'task_list' })
  }
  if (discovered.length === 0) {
    discovered.push({
      href: endpoint.toString(),
      name: connection.account_label ?? endpoint.hostname,
      resourceType: 'calendar',
    })
  }
  const rows = discovered.map((item, index) => {
    const prior = previous.get(`${item.resourceType}:${item.href}`)
    return {
      user_id: userId,
      connection_id: connection.id,
      provider: 'caldav',
      resource_type: item.resourceType,
      external_id: item.href,
      name: item.resourceType === 'task_list' ? `${item.name} · Tasks` : item.name,
      color: null,
      selected: prior?.selected ?? index === 0,
      is_default: index === 0,
      can_write: true,
      sync_mode: prior?.sync_mode ?? 'two_way',
      sync_token: prior?.sync_token ?? null,
      metadata: {
        ...(prior?.metadata ?? {}),
        web_url: endpoint.origin,
      },
      last_error: null,
    }
  })
  await dbWrite(
    'integration_sources?on_conflict=user_id,provider,resource_type,external_id',
    'POST',
    rows,
    'resolution=merge-duplicates,return=minimal',
  )
  return await selectedSources(userId, 'caldav')
}

async function pushCalDavEvents(
  userId: string,
  authorization: string,
  sources: Source[],
): Promise<Partial<SyncResult>> {
  const calendars = sources.filter(
    (source) => source.resource_type === 'calendar'
      && source.can_write
      && source.sync_mode === 'two_way',
  )
  const destination = calendars.find((source) => source.is_default) ?? calendars[0]
  const byId = new Map(sources.map((source) => [source.external_id, source]))
  const pending = await dbRows(
    `events?user_id=eq.${encodeURIComponent(userId)}&sync_status=eq.pending` +
    '&or=(source_provider.is.null,source_provider.eq.caldav)&select=*',
  )
  let pushedEvents = 0
  let deletedEvents = 0
  for (const event of pending) {
    const source = event.external_source_id ? byId.get(event.external_source_id) : destination
    if (!source || source.resource_type !== 'calendar' || source.sync_mode !== 'two_way') continue
    const collection = validateRemoteHttpsUrl(source.external_id)
    if (!collection) continue
    const resource = event.external_id
      ? validateRemoteHttpsUrl(event.external_id)
      : validateRemoteHttpsUrl(new URL(`${crypto.randomUUID()}.ics`, collection).toString())
    if (!resource) continue
    try {
      if (event.deleted_at && event.external_id) {
        const fetched = await remoteFetch(resource, {
          method: 'DELETE',
          headers: { Authorization: authorization },
        }, 100_000)
        if (![200, 204, 404].includes(fetched.response.status)) {
          throw new Error(`CALDAV_DELETE_${fetched.response.status}`)
        }
        await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'DELETE')
        deletedEvents++
        continue
      }
      if (event.deleted_at) continue
      const response = await remoteFetch(resource, {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'content-type': 'text/calendar; charset=utf-8',
          ...(event.external_etag ? { 'If-Match': event.external_etag } : { 'If-None-Match': '*' }),
        },
        body: buildEventCalendar({
          uid: event.external_id ?? `resq-${event.id}`,
          title: event.title,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          location: event.location,
        }),
      }, 100_000)
      if (![200, 201, 204].includes(response.response.status)) {
        throw new Error(`CALDAV_SAVE_${response.response.status}`)
      }
      const syncedAt = new Date().toISOString()
      await dbWrite(`events?id=eq.${encodeURIComponent(event.id)}`, 'PATCH', {
        source_provider: 'caldav',
        external_source_id: source.external_id,
        external_id: resource.toString(),
        external_etag: response.response.headers.get('etag'),
        external_url: source.metadata?.web_url ?? collection.origin,
        external_updated_at: syncedAt,
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

async function pushCalDavTasks(
  userId: string,
  authorization: string,
  sources: Source[],
): Promise<Partial<SyncResult>> {
  const lists = sources.filter(
    (source) => source.resource_type === 'task_list'
      && source.can_write
      && source.sync_mode === 'two_way',
  )
  const destination = lists.find((source) => source.is_default) ?? lists[0]
  const byId = new Map(sources.map((source) => [source.external_id, source]))
  const pending = await dbRows(
    `todos?user_id=eq.${encodeURIComponent(userId)}&sync_status=eq.pending` +
    '&or=(source_provider.is.null,source_provider.eq.caldav)&select=*',
  )
  let pushedTasks = 0
  let deletedTasks = 0
  for (const todo of pending) {
    const source = todo.external_source_id ? byId.get(todo.external_source_id) : destination
    if (!source || source.resource_type !== 'task_list' || source.sync_mode !== 'two_way') continue
    const collection = validateRemoteHttpsUrl(source.external_id)
    if (!collection) continue
    const resource = todo.external_id
      ? validateRemoteHttpsUrl(todo.external_id)
      : validateRemoteHttpsUrl(new URL(`${crypto.randomUUID()}.ics`, collection).toString())
    if (!resource) continue
    try {
      if (todo.deleted_at && todo.external_id) {
        const fetched = await remoteFetch(resource, {
          method: 'DELETE',
          headers: { Authorization: authorization },
        }, 100_000)
        if (![200, 204, 404].includes(fetched.response.status)) {
          throw new Error(`CALDAV_DELETE_${fetched.response.status}`)
        }
        await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'DELETE')
        deletedTasks++
        continue
      }
      if (todo.deleted_at) continue
      const dueAt = todo.due_date
        ? new Date(`${todo.due_date}T${todo.due_time ?? '09:00'}:00+09:00`).toISOString()
        : null
      const response = await remoteFetch(resource, {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'content-type': 'text/calendar; charset=utf-8',
          ...(todo.external_etag ? { 'If-Match': todo.external_etag } : { 'If-None-Match': '*' }),
        },
        body: buildTaskCalendar({
          uid: todo.external_id ?? `resq-${todo.id}`,
          title: todo.title,
          dueAt,
          completed: todo.done,
        }),
      }, 100_000)
      if (![200, 201, 204].includes(response.response.status)) {
        throw new Error(`CALDAV_SAVE_${response.response.status}`)
      }
      const syncedAt = new Date().toISOString()
      await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'PATCH', {
        source_provider: 'caldav',
        external_source_id: source.external_id,
        external_id: resource.toString(),
        external_etag: response.response.headers.get('etag'),
        external_url: source.metadata?.web_url ?? collection.origin,
        external_updated_at: syncedAt,
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

async function pullCalDavSource(
  userId: string,
  authorization: string,
  source: Source,
): Promise<Partial<SyncResult>> {
  const collection = validateRemoteHttpsUrl(source.external_id)
  if (!collection) throw new Error('CALDAV_SOURCE_INVALID')
  const range = syncWindow()
  const component = source.resource_type === 'calendar' ? 'VEVENT' : 'VTODO'
  const timeRange = source.resource_type === 'calendar'
    ? `<c:time-range start="${range.start.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}"
       end="${range.end.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}"/>`
    : ''
  const report = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="${component}">${timeRange}</c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`
  const fetched = await remoteFetch(collection, {
    method: 'REPORT',
    headers: {
      Authorization: authorization,
      Depth: '1',
      'content-type': 'application/xml; charset=utf-8',
    },
    body: report,
  })
  if (![200, 207].includes(fetched.response.status)) {
    throw new Error(`CALDAV_REPORT_${fetched.response.status}`)
  }
  const remoteIds: string[] = []
  let importedEvents = 0
  let importedTasks = 0
  for (const block of responseBlocks(fetched.body)) {
    const href = xmlValue(block, 'href')
    const data = xmlValue(block, 'calendar-data')
    if (!href || !data) continue
    const resource = validateRemoteHttpsUrl(new URL(href, fetched.finalUrl).toString())
    if (!resource) continue
    const externalId = resource.toString()
    remoteIds.push(externalId)
    const parsed = await upsertParsed(
      userId,
      'caldav',
      source,
      data,
      externalId,
      xmlValue(block, 'getetag'),
    )
    importedEvents += parsed.events
    importedTasks += parsed.tasks
  }
  const table = source.resource_type === 'calendar' ? 'events' : 'todos'
  const local = await dbRows(
    `${table}?user_id=eq.${encodeURIComponent(userId)}` +
    '&source_provider=eq.caldav' +
    `&external_source_id=eq.${encodeURIComponent(source.external_id)}` +
    '&select=id,external_id',
  )
  const current = new Set(remoteIds)
  const missing = local.filter((row) => !current.has(row.external_id))
  for (const row of missing) {
    await dbWrite(`${table}?id=eq.${encodeURIComponent(row.id)}`, 'DELETE')
  }
  await markSourceSynced(source)
  return {
    importedEvents,
    importedTasks,
    deletedEvents: table === 'events' ? missing.length : 0,
    deletedTasks: table === 'todos' ? missing.length : 0,
  }
}

export async function syncCalDav(
  userId: string,
  connection: JsonRecord,
): Promise<SyncResult> {
  const credentials = await readCredentials(connection.id)
  const endpoint = validateRemoteHttpsUrl(credentials?.endpoint_url)
  if (!credentials || !endpoint || !credentials.access_token) {
    throw new Error('CALDAV_RECONNECT_REQUIRED')
  }
  const authorization = basicAuthorization(credentials.username, credentials.access_token)
  const sources = await discoverCalDavSources(
    userId,
    connection,
    endpoint,
    authorization,
  )
  const result = emptyResult(sources.length)
  if (connection.sync_mode === 'two_way') {
    mergeResult(result, await pushCalDavEvents(userId, authorization, sources))
    mergeResult(result, await pushCalDavTasks(userId, authorization, sources))
  }
  for (const source of sources) {
    mergeResult(result, await pullCalDavSource(userId, authorization, source))
  }
  return result
}
