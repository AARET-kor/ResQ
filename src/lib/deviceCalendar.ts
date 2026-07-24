import { Capacitor, registerPlugin } from '@capacitor/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventItem } from './events'
import {
  mergeDiscoveredSources,
  type IntegrationProvider,
  type IntegrationSource,
  type IntegrationSyncResult,
} from './integrations'
import type { Todo } from './todos'

export interface DevicePermissionResult {
  platform: 'apple' | 'android'
  calendar: 'granted' | 'writeOnly' | 'denied' | 'prompt'
  reminders: 'granted' | 'denied' | 'prompt' | 'unsupported'
}

interface NativeSource {
  externalId: string
  name: string
  resourceType: 'calendar' | 'task_list'
  color?: string | null
  canWrite: boolean
  account?: string
}

interface NativeEvent {
  id: string
  sourceId: string
  title: string
  startsAt: string
  endsAt: string | null
  location: string | null
  updatedAt: string | null
  url: string | null
}

interface NativeReminder {
  id: string
  sourceId: string
  title: string
  dueAt: string | null
  completed: boolean
  updatedAt: string | null
  url: string | null
}

interface DeviceCalendarPlugin {
  requestPermissions(): Promise<DevicePermissionResult>
  listSources(): Promise<{
    platform: 'apple' | 'android'
    sources: NativeSource[]
  }>
  readItems(options: {
    start: string
    end: string
    calendarIds: string[]
    reminderListIds: string[]
  }): Promise<{
    platform: 'apple' | 'android'
    events: NativeEvent[]
    reminders: NativeReminder[]
  }>
  upsertEvent(options: {
    id?: string
    sourceId: string
    title: string
    startsAt: string
    endsAt?: string | null
    location?: string | null
  }): Promise<NativeEvent>
  deleteEvent(options: { id: string }): Promise<void>
  upsertReminder(options: {
    id?: string
    sourceId: string
    title: string
    dueAt?: string | null
    completed: boolean
  }): Promise<NativeReminder>
  deleteReminder(options: { id: string }): Promise<void>
}

const DeviceCalendar = registerPlugin<DeviceCalendarPlugin>('DeviceCalendar')

export function isDeviceCalendarAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

export function deviceProvider(): 'apple' | 'android' | null {
  if (!Capacitor.isNativePlatform()) return null
  return Capacitor.getPlatform() === 'ios' ? 'apple' : 'android'
}

export async function connectDeviceCalendar(
  client: SupabaseClient,
  userId: string,
): Promise<{
  permissions: DevicePermissionResult
  sources: IntegrationSource[]
}> {
  if (!isDeviceCalendarAvailable()) throw new Error('모바일 앱에서만 사용할 수 있습니다.')
  const permissions = await DeviceCalendar.requestPermissions()
  if (permissions.calendar !== 'granted' && permissions.reminders !== 'granted') {
    throw new Error('기기 설정에서 캘린더 또는 미리 알림 접근을 허용해주세요.')
  }
  const catalog = await DeviceCalendar.listSources()
  const provider = catalog.platform
  const sources = await mergeDiscoveredSources(
    client,
    userId,
    provider,
    catalog.sources.map((source) => ({
      external_id: source.externalId,
      name: source.account ? `${source.name} · ${source.account}` : source.name,
      color: source.color ?? null,
      resource_type: source.resourceType,
      can_write: source.canWrite,
    })),
  )
  return { permissions, sources }
}

function defaultWindow(now = new Date()): { start: string; end: string } {
  const start = new Date(now)
  const end = new Date(now)
  start.setDate(start.getDate() - 90)
  end.setFullYear(end.getFullYear() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

async function pushDeviceEvents(
  client: SupabaseClient,
  userId: string,
  provider: IntegrationProvider,
  destination: IntegrationSource | undefined,
): Promise<{ pushed: number; deleted: number }> {
  const { data, error } = await client
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .eq('sync_status', 'pending')
    .or(`source_provider.is.null,source_provider.eq.${provider}`)
  if (error) throw error
  let pushed = 0
  let deleted = 0
  for (const event of (data as EventItem[] | null) ?? []) {
    if (!event.external_id && !destination?.can_write) continue
    const sourceId = event.external_source_id ?? destination?.external_id
    if (!sourceId) continue
    try {
      if (event.deleted_at && event.external_id) {
        await DeviceCalendar.deleteEvent({ id: event.external_id })
        const { error: removeError } = await client.from('events').delete().eq('id', event.id)
        if (removeError) throw removeError
        deleted++
        continue
      }
      if (event.deleted_at) continue
      const remote = await DeviceCalendar.upsertEvent({
        id: event.external_id ?? undefined,
        sourceId,
        title: event.title,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        location: event.location,
      })
      const syncedAt = new Date().toISOString()
      const { error: updateError } = await client.from('events').update({
        source_provider: provider,
        external_source_id: remote.sourceId,
        external_id: remote.id,
        external_url: remote.url ?? null,
        external_updated_at: remote.updatedAt ?? syncedAt,
        last_synced_at: syncedAt,
        sync_status: 'synced',
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

async function pushDeviceReminders(
  client: SupabaseClient,
  userId: string,
  destination: IntegrationSource | undefined,
): Promise<{ pushed: number; deleted: number }> {
  if (!destination) return { pushed: 0, deleted: 0 }
  const { data, error } = await client
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .eq('sync_status', 'pending')
    .or('source_provider.is.null,source_provider.eq.apple')
  if (error) throw error
  let pushed = 0
  let deleted = 0
  for (const todo of (data as Todo[] | null) ?? []) {
    const sourceId = todo.external_source_id ?? destination.external_id
    try {
      if (todo.deleted_at && todo.external_id) {
        await DeviceCalendar.deleteReminder({ id: todo.external_id })
        const { error: removeError } = await client.from('todos').delete().eq('id', todo.id)
        if (removeError) throw removeError
        deleted++
        continue
      }
      if (todo.deleted_at) continue
      const dueAt = todo.due_date
        ? new Date(`${todo.due_date}T${todo.due_time ?? '09:00'}:00`).toISOString()
        : null
      const remote = await DeviceCalendar.upsertReminder({
        id: todo.external_id ?? undefined,
        sourceId,
        title: todo.title,
        dueAt,
        completed: todo.done,
      })
      const syncedAt = new Date().toISOString()
      const { error: updateError } = await client.from('todos').update({
        source_provider: 'apple',
        external_source_id: remote.sourceId,
        external_id: remote.id,
        external_url: remote.url ?? null,
        external_updated_at: remote.updatedAt ?? syncedAt,
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

export async function syncDeviceCalendar(
  client: SupabaseClient,
  userId: string,
  sources: IntegrationSource[],
  now = new Date(),
): Promise<IntegrationSyncResult> {
  const provider = deviceProvider()
  if (!provider) throw new Error('모바일 앱에서만 사용할 수 있습니다.')
  const selected = sources.filter((source) => source.provider === provider && source.selected)
  const calendars = selected.filter((source) => source.resource_type === 'calendar')
  const taskLists = selected.filter((source) => source.resource_type === 'task_list')
  const destinationCalendar = calendars.find((source) => source.can_write)
  const destinationTaskList = taskLists.find((source) => source.can_write)

  const eventPush = await pushDeviceEvents(
    client,
    userId,
    provider,
    destinationCalendar,
  )
  const reminderPush = provider === 'apple'
    ? await pushDeviceReminders(client, userId, destinationTaskList)
    : { pushed: 0, deleted: 0 }

  const range = defaultWindow(now)
  const remote = await DeviceCalendar.readItems({
    start: range.start,
    end: range.end,
    calendarIds: calendars.map((source) => source.external_id),
    reminderListIds: taskLists.map((source) => source.external_id),
  })
  const syncedAt = new Date().toISOString()
  const eventRows = remote.events.map((event) => ({
    user_id: userId,
    title: event.title.trim() || '(제목 없음)',
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    kind: 'other',
    location: event.location ?? null,
    notes: null,
    source_provider: provider,
    external_source_id: event.sourceId,
    external_id: event.id,
    external_url: event.url ?? null,
    external_updated_at: event.updatedAt ?? null,
    last_synced_at: syncedAt,
    sync_status: 'synced',
    deleted_at: null,
  }))
  if (eventRows.length > 0) {
    const { error } = await client.from('events').upsert(eventRows, {
      onConflict: 'user_id,source_provider,external_source_id,external_id',
    })
    if (error) throw error
  }
  let removedEvents = 0
  if (calendars.length > 0) {
    const { data: localEvents, error } = await client
      .from('events')
      .select('id,external_id')
      .eq('user_id', userId)
      .eq('source_provider', provider)
      .in('external_source_id', calendars.map((source) => source.external_id))
      .gte('starts_at', range.start)
      .lt('starts_at', range.end)
    if (error) throw error
    const remoteIds = new Set(remote.events.map((event) => event.id))
    const missing = ((localEvents as Pick<EventItem, 'id' | 'external_id'>[] | null) ?? [])
      .filter((event) => event.external_id && !remoteIds.has(event.external_id))
    for (const event of missing) {
      const { error: removeError } = await client.from('events').delete().eq('id', event.id)
      if (removeError) throw removeError
    }
    removedEvents = missing.length
  }

  const reminderRows = remote.reminders.map((reminder) => {
    const due = reminder.dueAt ? new Date(reminder.dueAt) : null
    return {
      user_id: userId,
      title: reminder.title.trim() || '(제목 없음)',
      done: reminder.completed,
      due_date: due && !Number.isNaN(due.getTime())
        ? due.toISOString().slice(0, 10)
        : null,
      due_time: due && !Number.isNaN(due.getTime())
        ? due.toTimeString().slice(0, 5)
        : null,
      priority: 'normal',
      source_provider: 'apple',
      external_source_id: reminder.sourceId,
      external_id: reminder.id,
      external_url: reminder.url ?? null,
      external_updated_at: reminder.updatedAt ?? null,
      last_synced_at: syncedAt,
      sync_status: 'synced',
      deleted_at: null,
    }
  })
  if (reminderRows.length > 0) {
    const { error } = await client.from('todos').upsert(reminderRows, {
      onConflict: 'user_id,source_provider,external_source_id,external_id',
    })
    if (error) throw error
  }
  let removedReminders = 0
  if (taskLists.length > 0) {
    const { data: localReminders, error } = await client
      .from('todos')
      .select('id,external_id')
      .eq('user_id', userId)
      .eq('source_provider', 'apple')
      .in('external_source_id', taskLists.map((source) => source.external_id))
    if (error) throw error
    const remoteIds = new Set(remote.reminders.map((reminder) => reminder.id))
    const missing = ((localReminders as Pick<Todo, 'id' | 'external_id'>[] | null) ?? [])
      .filter((reminder) => reminder.external_id && !remoteIds.has(reminder.external_id))
    for (const reminder of missing) {
      const { error: removeError } = await client.from('todos').delete().eq('id', reminder.id)
      if (removeError) throw removeError
    }
    removedReminders = missing.length
  }

  for (const source of selected) {
    const { error } = await client.from('integration_sources').update({
      last_synced_at: syncedAt,
      last_error: null,
    }).eq('id', source.id)
    if (error) throw error
  }

  return {
    importedEvents: eventRows.length,
    importedTasks: reminderRows.length,
    pushedEvents: eventPush.pushed,
    pushedTasks: reminderPush.pushed,
    deletedEvents: eventPush.deleted + removedEvents,
    deletedTasks: reminderPush.deleted + removedReminders,
    sources: selected.length,
  }
}
