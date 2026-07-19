import type { SupabaseClient } from '@supabase/supabase-js'

export type TodoPriority = 'high' | 'normal' | 'low'

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
}

export async function listTodos(client: SupabaseClient, userId: string): Promise<Todo[]> {
  const { data, error } = await client
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Todo[]) ?? []
}

export async function addTodo(
  client: SupabaseClient,
  userId: string,
  title: string,
  dueDate: string | null,
  opts: { priority?: TodoPriority; dueTime?: string | null } = {},
): Promise<Todo> {
  const { data, error } = await client
    .from('todos')
    .insert({
      user_id: userId,
      title,
      due_date: dueDate,
      priority: opts.priority ?? 'normal',
      due_time: opts.dueTime ?? null,
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
  xpGranted: boolean,
): Promise<Todo> {
  const { data, error } = await client
    .from('todos')
    .update({ done, xp_granted: xpGranted })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Todo
}

export async function deleteTodo(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('todos').delete().eq('id', id)
  if (error) throw error
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
