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
  selectedSources,
  type Source,
  type SyncResult,
} from './common.ts'

async function tokenFor(connection: JsonRecord): Promise<string> {
  const credentials = await readCredentials(connection.id)
  if (!credentials) throw new Error('TODOIST_RECONNECT_REQUIRED')
  const expiresAt = credentials.expires_at
    ? new Date(credentials.expires_at).getTime()
    : Number.POSITIVE_INFINITY
  if (expiresAt > Date.now() + 120_000) return credentials.access_token
  if (!credentials.refresh_token) return credentials.access_token
  const clientId = Deno.env.get('TODOIST_CLIENT_ID')
  const clientSecret = Deno.env.get('TODOIST_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('TODOIST_OAUTH_NOT_CONFIGURED')
  const response = await fetch('https://api.todoist.com/oauth/access_token', {
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
      { status: 'expired', last_error: 'Todoist 연결을 다시 승인해주세요.' },
    )
    throw new Error('TODOIST_RECONNECT_REQUIRED')
  }
  await storeCredentials(connection.id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? credentials.refresh_token,
    token_type: tokens.token_type ?? 'Bearer',
    expires_at: tokens.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
      : null,
    scope: tokens.scope ?? credentials.scope,
  })
  return tokens.access_token
}

async function syncRequest(
  token: string,
  form: Record<string, string>,
): Promise<JsonRecord> {
  const response = await fetch('https://api.todoist.com/api/v1/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('TODOIST_RECONNECT_REQUIRED')
    throw new Error(body?.error ?? `TODOIST_${response.status}`)
  }
  return body
}

async function refreshSources(
  userId: string,
  connectionId: string,
  projects: JsonRecord[],
): Promise<Source[]> {
  const existing = await dbRows(
    `integration_sources?user_id=eq.${encodeURIComponent(userId)}` +
    '&provider=eq.todoist&select=*',
  )
  const prior = new Map(existing.map((source) => [source.external_id, source]))
  const hasSelected = existing.some((source) => source.selected)
  const active = projects.filter((project) => !(project.is_deleted ?? project.isDeleted))
  const rows = active.map((project, index) => {
    const previous = prior.get(String(project.id))
    const isInbox = Boolean(project.is_inbox_project ?? project.isInboxProject)
    return {
      user_id: userId,
      connection_id: connectionId,
      provider: 'todoist',
      resource_type: 'task_list',
      external_id: String(project.id),
      name: project.name ?? 'Todoist',
      color: project.color ?? null,
      selected: previous?.selected ?? (!hasSelected && (isInbox || index === 0)),
      is_default: isInbox || index === 0,
      can_write: true,
      sync_mode: previous?.sync_mode ?? 'two_way',
      metadata: {
        web_url: project.url ?? `https://app.todoist.com/app/project/${project.id}`,
      },
      last_synced_at: previous?.last_synced_at ?? null,
      last_error: null,
    }
  })
  if (rows.length) {
    await dbWrite(
      'integration_sources?on_conflict=user_id,provider,resource_type,external_id',
      'POST',
      rows,
      'resolution=merge-duplicates,return=minimal',
    )
  }
  return await selectedSources(userId, 'todoist')
}

function commandId(): string {
  return crypto.randomUUID()
}

async function executeCommand(
  token: string,
  command: JsonRecord,
): Promise<JsonRecord> {
  const response = await syncRequest(token, {
    commands: JSON.stringify([command]),
  })
  const status = response.sync_status?.[command.uuid]
  if (status !== 'ok') {
    throw new Error(typeof status === 'object' ? status.error ?? 'TODOIST_COMMAND' : 'TODOIST_COMMAND')
  }
  return response
}

async function pushTasks(
  userId: string,
  token: string,
  sources: Source[],
): Promise<{ result: Partial<SyncResult>; syncToken: string | null }> {
  const writable = sources.filter(
    (source) => source.can_write && source.sync_mode === 'two_way',
  )
  const destination = writable.find((source) => source.is_default) ?? writable[0]
  const byId = new Map(sources.map((source) => [source.external_id, source]))
  const pending = await dbRows(
    `todos?user_id=eq.${encodeURIComponent(userId)}&sync_status=eq.pending` +
    '&or=(source_provider.is.null,source_provider.eq.todoist)&select=*',
  )
  let pushedTasks = 0
  let deletedTasks = 0
  let latestToken: string | null = null
  for (const todo of pending) {
    const source = todo.external_source_id ? byId.get(todo.external_source_id) : destination
    if (!source || source.sync_mode !== 'two_way') continue
    try {
      if (todo.deleted_at && todo.external_id) {
        const response = await executeCommand(token, {
          type: 'item_delete',
          uuid: commandId(),
          args: { id: todo.external_id },
        })
        latestToken = response.sync_token ?? latestToken
        await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'DELETE')
        deletedTasks++
        continue
      }
      if (todo.deleted_at) continue
      let externalId = todo.external_id
      const wasNew = !externalId
      if (!externalId) {
        const tempId = crypto.randomUUID()
        const response = await executeCommand(token, {
          type: 'item_add',
          temp_id: tempId,
          uuid: commandId(),
          args: {
            content: todo.title,
            project_id: source.external_id,
            priority: todo.priority === 'high' ? 4 : todo.priority === 'low' ? 1 : 2,
            ...(todo.due_date ? { due: { date: todo.due_date } } : {}),
          },
        })
        latestToken = response.sync_token ?? latestToken
        externalId = response.temp_id_mapping?.[tempId]
        if (!externalId) throw new Error('TODOIST_ID_MAPPING')
      } else {
        const response = await executeCommand(token, {
          type: 'item_update',
          uuid: commandId(),
          args: {
            id: externalId,
            content: todo.title,
            priority: todo.priority === 'high' ? 4 : todo.priority === 'low' ? 1 : 2,
            ...(todo.due_date ? { due: { date: todo.due_date } } : { due: null }),
          },
        })
        latestToken = response.sync_token ?? latestToken
      }
      if (todo.done || !wasNew) {
        const completion = await executeCommand(token, {
          type: todo.done ? 'item_close' : 'item_uncomplete',
          uuid: commandId(),
          args: { id: externalId },
        })
        latestToken = completion.sync_token ?? latestToken
      }
      const syncedAt = new Date().toISOString()
      await dbWrite(`todos?id=eq.${encodeURIComponent(todo.id)}`, 'PATCH', {
        source_provider: 'todoist',
        external_source_id: source.external_id,
        external_id: externalId,
        external_url: `https://app.todoist.com/app/task/${externalId}`,
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
  return { result: { pushedTasks, deletedTasks }, syncToken: latestToken }
}

function todoistPriority(value: unknown): 'high' | 'normal' | 'low' {
  const priority = Number(value)
  if (priority >= 4) return 'high'
  if (priority <= 1) return 'low'
  return 'normal'
}

async function pullTasks(
  userId: string,
  items: JsonRecord[],
  sources: Source[],
): Promise<Partial<SyncResult>> {
  const selectedIds = new Set(sources.map((source) => source.external_id))
  const relevant = items.filter((item) => selectedIds.has(String(item.project_id ?? item.projectId)))
  const removed = relevant.filter((item) => item.is_deleted ?? item.isDeleted)
  for (const item of removed) {
    await dbWrite(
      `todos?user_id=eq.${encodeURIComponent(userId)}` +
      '&source_provider=eq.todoist' +
      `&external_id=eq.${encodeURIComponent(item.id)}`,
      'DELETE',
    )
  }
  const syncedAt = new Date().toISOString()
  const active = relevant.filter((item) => !(item.is_deleted ?? item.isDeleted))
  const rows = active.map((item) => {
    const projectId = String(item.project_id ?? item.projectId)
    const due = item.due?.date ?? item.due?.datetime ?? null
    return {
      user_id: userId,
      title: String(item.content ?? '').trim() || '(제목 없음)',
      done: Boolean(item.checked ?? item.is_completed ?? item.isCompleted),
      due_date: typeof due === 'string' ? due.slice(0, 10) : null,
      due_time: typeof due === 'string' && due.includes('T') ? due.slice(11, 16) : null,
      priority: todoistPriority(item.priority),
      source_provider: 'todoist',
      external_source_id: projectId,
      external_id: String(item.id),
      external_etag: null,
      external_url: item.url ?? `https://app.todoist.com/app/task/${item.id}`,
      external_updated_at: item.updated_at ?? item.updatedAt ?? null,
      last_synced_at: syncedAt,
      sync_status: 'synced',
      deleted_at: null,
    }
  })
  if (rows.length) {
    await dbWrite(
      'todos?on_conflict=user_id,source_provider,external_source_id,external_id',
      'POST',
      rows,
      'resolution=merge-duplicates,return=minimal',
    )
  }
  for (const source of sources) await markSourceSynced(source)
  return { importedTasks: rows.length, deletedTasks: removed.length }
}

export async function syncTodoist(
  userId: string,
  connection: JsonRecord,
  options: { discoverOnly?: boolean } = {},
): Promise<SyncResult> {
  const token = await tokenFor(connection)
  const previousToken = connection.provider_config?.sync_token ?? '*'
  const response = await syncRequest(token, {
    sync_token: previousToken,
    resource_types: JSON.stringify(['projects', 'items']),
  })
  const projects = Array.isArray(response.projects) ? response.projects : []
  let sources = await refreshSources(userId, connection.id, projects)
  if (sources.length === 0 && previousToken !== '*') {
    const full = await syncRequest(token, {
      sync_token: '*',
      resource_types: JSON.stringify(['projects']),
    })
    sources = await refreshSources(userId, connection.id, full.projects ?? [])
  }
  const result = emptyResult(sources.length)
  if (options.discoverOnly) return result
  const pulled = await pullTasks(userId, response.items ?? [], sources)
  result.importedTasks += pulled.importedTasks ?? 0
  result.deletedTasks += pulled.deletedTasks ?? 0
  let finalToken = response.sync_token ?? previousToken
  if (connection.sync_mode === 'two_way') {
    const pushed = await pushTasks(userId, token, sources)
    result.pushedTasks += pushed.result.pushedTasks ?? 0
    result.deletedTasks += pushed.result.deletedTasks ?? 0
    finalToken = pushed.syncToken ?? finalToken
  }
  await dbWrite(
    `integration_connections?id=eq.${encodeURIComponent(connection.id)}`,
    'PATCH',
    {
      provider_config: {
        ...(connection.provider_config ?? {}),
        sync_token: finalToken,
      },
    },
  )
  return result
}
