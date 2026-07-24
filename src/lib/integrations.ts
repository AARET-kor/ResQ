import type { SupabaseClient } from '@supabase/supabase-js'

export type IntegrationProvider =
  | 'google'
  | 'microsoft'
  | 'apple'
  | 'android'
  | 'ics'
  | 'caldav'

export type IntegrationResourceType = 'calendar' | 'task_list'
export type SyncStatus = 'pending' | 'synced' | 'error'

export const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  apple: 'Apple',
  android: 'Android',
  ics: 'ICS',
  caldav: 'CalDAV',
}

export interface IntegrationConnection {
  id: string
  user_id: string
  provider: IntegrationProvider
  provider_account_id: string
  account_email: string | null
  account_label: string | null
  status: 'active' | 'expired' | 'error' | 'disabled'
  scopes: string[]
  last_synced_at: string | null
  last_error: string | null
}

export interface IntegrationSource {
  id: string
  user_id: string
  connection_id: string | null
  provider: IntegrationProvider
  resource_type: IntegrationResourceType
  external_id: string
  name: string
  color: string | null
  selected: boolean
  is_default: boolean
  can_write: boolean
  last_synced_at: string | null
  last_error: string | null
}

export interface DiscoveredSource {
  external_id: string
  name: string
  color?: string | null
  resource_type: IntegrationResourceType
  is_default?: boolean
  can_write?: boolean
}

export async function listIntegrationSources(
  client: SupabaseClient,
  userId: string,
  provider?: IntegrationProvider,
): Promise<IntegrationSource[]> {
  let query = client
    .from('integration_sources')
    .select('*')
    .eq('user_id', userId)
    .order('resource_type')
    .order('name')
  if (provider) query = query.eq('provider', provider)
  const { data, error } = await query
  if (error) throw error
  return (data as IntegrationSource[]) ?? []
}

export async function mergeDiscoveredSources(
  client: SupabaseClient,
  userId: string,
  provider: IntegrationProvider,
  discovered: DiscoveredSource[],
): Promise<IntegrationSource[]> {
  const existing = await listIntegrationSources(client, userId, provider)
  const existingByIdentity = new Map(
    existing.map((source) => [`${source.resource_type}:${source.external_id}`, source]),
  )
  const hasSelectedCalendar = existing.some(
    (source) => source.resource_type === 'calendar' && source.selected,
  )
  const hasSelectedTaskList = existing.some(
    (source) => source.resource_type === 'task_list' && source.selected,
  )

  let calendarIndex = 0
  let taskListIndex = 0
  const rows = discovered.map((source) => {
    const previous = existingByIdentity.get(`${source.resource_type}:${source.external_id}`)
    const resourceIndex = source.resource_type === 'calendar'
      ? calendarIndex++
      : taskListIndex++
    const shouldSelectDefault = source.resource_type === 'calendar'
      ? !hasSelectedCalendar && (Boolean(source.is_default) || resourceIndex === 0)
      : !hasSelectedTaskList && (Boolean(source.is_default) || resourceIndex === 0)
    return {
      user_id: userId,
      provider,
      resource_type: source.resource_type,
      external_id: source.external_id,
      name: source.name,
      color: source.color ?? null,
      selected: previous?.selected ?? shouldSelectDefault,
      is_default: Boolean(source.is_default),
      can_write: source.can_write ?? true,
      last_error: null,
    }
  })

  if (rows.length > 0) {
    const { error } = await client
      .from('integration_sources')
      .upsert(rows, {
        onConflict: 'user_id,provider,resource_type,external_id',
      })
    if (error) throw error
  }
  return listIntegrationSources(client, userId, provider)
}

export async function setIntegrationSourceSelected(
  client: SupabaseClient,
  sourceId: string,
  selected: boolean,
): Promise<void> {
  const { error } = await client
    .from('integration_sources')
    .update({ selected, last_error: null })
    .eq('id', sourceId)
  if (error) throw error
}

export async function listIntegrationConnections(
  client: SupabaseClient,
  userId: string,
): Promise<IntegrationConnection[]> {
  const { data, error } = await client
    .from('integration_connections')
    .select('*')
    .eq('user_id', userId)
    .order('created_at')
  if (error) throw error
  return (data as IntegrationConnection[]) ?? []
}

export async function disconnectIntegration(
  client: SupabaseClient,
  connectionId: string,
): Promise<void> {
  const { error } = await client
    .from('integration_connections')
    .delete()
    .eq('id', connectionId)
  if (error) throw error
}

export async function startMicrosoftConnection(
  client: SupabaseClient,
  returnTo: string,
): Promise<string> {
  const { data, error } = await client.functions.invoke('integration-oauth', {
    body: { action: 'start', provider: 'microsoft', returnTo },
  })
  if (error) throw error
  if (!data?.authorizationUrl) throw new Error(data?.error ?? 'Microsoft 연결 URL을 만들지 못했습니다.')
  return data.authorizationUrl as string
}

export interface IntegrationSyncResult {
  importedEvents: number
  importedTasks: number
  pushedEvents: number
  pushedTasks: number
  deletedEvents: number
  deletedTasks: number
  sources: number
}

export async function syncMicrosoftIntegration(
  client: SupabaseClient,
): Promise<IntegrationSyncResult> {
  const { data, error } = await client.functions.invoke('integration-sync', {
    body: { provider: 'microsoft' },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as IntegrationSyncResult
}
