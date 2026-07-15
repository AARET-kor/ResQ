import type { SupabaseClient } from '@supabase/supabase-js'

export interface Todo {
  id: string
  user_id: string
  title: string
  done: boolean
  due_date: string | null
  xp_granted: boolean
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
): Promise<Todo> {
  const { data, error } = await client
    .from('todos')
    .insert({ user_id: userId, title, due_date: dueDate })
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
