import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from './profile'
import type { IntegrationProvider, SyncStatus } from './integrations'

export type TodoPriority = 'high' | 'normal' | 'low'

export const PRIORITIES: TodoPriority[] = ['high', 'normal', 'low']

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
  high: '높음', normal: '보통', low: '낮음',
}
/** Left-bar / pill colors per priority (readability accents). */
export const PRIORITY_COLOR: Record<TodoPriority, string> = {
  high: '#ff6b6b', normal: '#5aa9ff', low: '#8a93a6',
}

export interface Todo {
  id: string
  user_id: string
  title: string
  done: boolean
  due_date: string | null
  xp_granted: boolean
  priority: TodoPriority
  due_time: string | null
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

export async function listTodos(client: SupabaseClient, userId: string): Promise<Todo[]> {
  const { data, error } = await client
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Todo[]) ?? []
}

export async function addTodo(
  client: SupabaseClient,
  userId: string,
  title: string,
  dueDate: string | null,
  opts: {
    priority?: TodoPriority
    dueTime?: string | null
    sourceProvider?: IntegrationProvider | null
    externalSourceId?: string | null
    syncStatus?: SyncStatus
  } = {},
): Promise<Todo> {
  const { data, error } = await client
    .from('todos')
    .insert({
      user_id: userId,
      title,
      due_date: dueDate,
      priority: opts.priority ?? 'normal',
      due_time: opts.dueTime ?? null,
      source_provider: opts.sourceProvider ?? null,
      external_source_id: opts.externalSourceId ?? null,
      sync_status: opts.syncStatus ?? 'pending',
    })
    .select()
    .single()
  if (error) throw error
  return data as Todo
}

export async function setTodoDone(
  client: SupabaseClient,
  id: string,
  done: boolean,
): Promise<{ todo: Todo; profile: Profile; xpGrantedNow: boolean }> {
  const { data, error } = await client.rpc('set_todo_done_with_xp', {
    p_todo_id: id,
    p_done: done,
  })
  if (error) throw error
  const result = data as { todo: Todo; profile: Profile; xp_granted_now: boolean }
  return {
    todo: result.todo,
    profile: result.profile,
    xpGrantedNow: result.xp_granted_now,
  }
}

export async function deleteTodo(client: SupabaseClient, id: string): Promise<void> {
  const { data, error: tombstoneError } = await client
    .from('todos')
    .update({
      deleted_at: new Date().toISOString(),
      sync_status: 'pending',
    })
    .eq('id', id)
    .not('external_id', 'is', null)
    .select('id')
  if (tombstoneError) throw tombstoneError
  if ((data ?? []).length > 0) return

  const { error: deleteError } = await client.from('todos').delete().eq('id', id)
  if (deleteError) throw deleteError
}

const PRIORITY_RANK: Record<TodoPriority, number> = { high: 0, normal: 1, low: 2 }

/** Undone first → priority → due date+time (missing due last) → stable. */
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const pr = PRIORITY_RANK[a.priority ?? 'normal'] - PRIORITY_RANK[b.priority ?? 'normal']
    if (pr !== 0) return pr
    const da = a.due_date ? `${a.due_date}T${a.due_time ?? '23:59'}` : '9999-12-31T23:59'
    const db = b.due_date ? `${b.due_date}T${b.due_time ?? '23:59'}` : '9999-12-31T23:59'
    return da.localeCompare(db)
  })
}
