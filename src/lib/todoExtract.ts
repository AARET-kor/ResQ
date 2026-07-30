import type { SupabaseClient } from '@supabase/supabase-js'
import type { TodoPriority } from './todos'

export interface ExtractedTodo {
  title: string
  due_date: string | null
  due_time: string | null
  priority: TodoPriority
}

const PRIORITIES = new Set(['high', 'normal', 'low'])

function isValidExtractedTodo(t: unknown): t is ExtractedTodo {
  if (typeof t !== 'object' || t === null) return false
  const v = t as Record<string, unknown>
  if (typeof v.title !== 'string' || v.title.trim().length === 0) return false
  if (v.due_date != null && (typeof v.due_date !== 'string' || Number.isNaN(new Date(v.due_date).getTime()))) return false
  if (v.due_time != null && (typeof v.due_time !== 'string' || !/^\d{2}:\d{2}$/.test(v.due_time))) return false
  return true
}

/** Claude-backed extraction of todos from a pasted memo or image. Untrusted LLM
 *  output is validated/normalized here so malformed items can never crash the UI. */
export async function requestTodoExtraction(
  client: SupabaseClient,
  input: { text?: string; imageBase64?: string; mediaType?: string },
  specialty: string | null,
): Promise<ExtractedTodo[]> {
  const { data, error } = await client.functions.invoke('extract-todos', {
    body: { ...input, specialty },
  })
  if (error || !data?.todos) {
    throw new Error('추출 서버 오류 — ANTHROPIC_API_KEY 시크릿 미설정 또는 함수 미배포일 수 있습니다.')
  }
  return (data.todos as unknown[]).filter(isValidExtractedTodo).map((t) => ({
    title: t.title.trim(),
    due_date: t.due_date ?? null,
    due_time: t.due_time ?? null,
    priority: PRIORITIES.has(t.priority as string) ? (t.priority as TodoPriority) : 'normal',
  }))
}
