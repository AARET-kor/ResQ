import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventKind } from './events'
import { redactSensitiveText } from './privacy'
import type { TodoPriority } from './todos'

export const PLANNER_EXTRACT_MAX_TEXT_CHARS = 100_000
export const PLANNER_EXTRACT_MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const PLANNER_EXTRACT_MAX_CANDIDATES_PER_TYPE = 30

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const EVENT_KINDS = new Set<EventKind>([
  'conference',
  'surgery',
  'social',
  'professor',
  'other',
])
const TODO_PRIORITIES = new Set<TodoPriority>(['high', 'normal', 'low'])
const ISO_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/

export interface PlannerCaptureInput {
  text?: string
  imageBase64?: string
  mediaType?: string
}

export type PlannerExtractionInput = PlannerCaptureInput

export interface PlannerExtractionContext {
  nowISO?: string
  timeZone?: string
}

export interface PlannerTodoCandidate {
  id: string
  type: 'todo'
  title: string
  due_date: string | null
  due_time: string | null
  priority: TodoPriority
}

export interface PlannerEventCandidate {
  id: string
  type: 'event'
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  notes: string | null
  kind: EventKind
}

export type PlannerCandidate = PlannerTodoCandidate | PlannerEventCandidate

export type ExtractedTodoCandidate = PlannerTodoCandidate
export type ExtractedEventCandidate = PlannerEventCandidate

export interface PlannerExtractionResult {
  todos: PlannerTodoCandidate[]
  events: PlannerEventCandidate[]
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  )
}

function isClockTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  return Boolean(
    match
    && Number(match[1]) >= 0
    && Number(match[1]) <= 23
    && Number(match[2]) >= 0
    && Number(match[2]) <= 59,
  )
}

function isZonedDateTime(value: string): boolean {
  return ISO_WITH_TIMEZONE.test(value) && !Number.isNaN(Date.parse(value))
}

function normalizeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.trim()
  return title.length > 0 && title.length <= 300 ? title : null
}

function stableCandidateId(
  type: PlannerCandidate['type'],
  value: unknown,
): string {
  const serialized = JSON.stringify(value) ?? ''
  let hash = 2_166_136_261
  for (let characterIndex = 0; characterIndex < serialized.length; characterIndex += 1) {
    hash ^= serialized.charCodeAt(characterIndex)
    hash = Math.imul(hash, 16_777_619)
  }
  return `${type}-${(hash >>> 0).toString(36)}`
}

function normalizeTodo(value: unknown): PlannerTodoCandidate | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  const title = normalizeTitle(item.title)
  if (!title) return null

  const dueDate = item.due_date == null ? null : item.due_date
  if (dueDate !== null && (typeof dueDate !== 'string' || !isCalendarDate(dueDate))) {
    return null
  }
  const dueTime = item.due_time == null ? null : item.due_time
  if (dueTime !== null && (typeof dueTime !== 'string' || !isClockTime(dueTime))) {
    return null
  }
  if (dueTime !== null && dueDate === null) return null

  const priority = typeof item.priority === 'string'
    && TODO_PRIORITIES.has(item.priority as TodoPriority)
    ? item.priority as TodoPriority
    : 'normal'
  const normalized = {
    title,
    due_date: dueDate,
    due_time: dueTime,
    priority,
  }
  return {
    id: stableCandidateId('todo', normalized),
    type: 'todo',
    ...normalized,
  }
}

function normalizeEvent(value: unknown): PlannerEventCandidate | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  const title = normalizeTitle(item.title)
  if (!title || typeof item.starts_at !== 'string' || !isZonedDateTime(item.starts_at)) {
    return null
  }
  if (
    typeof item.kind !== 'string'
    || !EVENT_KINDS.has(item.kind as EventKind)
  ) {
    return null
  }

  const endsAt = item.ends_at == null ? null : item.ends_at
  if (
    endsAt !== null
    && (
      typeof endsAt !== 'string'
      || !isZonedDateTime(endsAt)
      || Date.parse(endsAt) <= Date.parse(item.starts_at)
    )
  ) {
    return null
  }
  const location = item.location == null ? null : item.location
  if (
    location !== null
    && (
      typeof location !== 'string'
      || location.trim().length === 0
      || location.trim().length > 500
    )
  ) {
    return null
  }
  const notes = item.notes == null ? null : item.notes
  if (
    notes !== null
    && (
      typeof notes !== 'string'
      || notes.trim().length === 0
      || notes.trim().length > 5_000
    )
  ) {
    return null
  }
  const normalized = {
    title,
    starts_at: item.starts_at,
    ends_at: endsAt,
    location: typeof location === 'string' ? location.trim() : null,
    notes: typeof notes === 'string' ? notes.trim() : null,
    kind: item.kind as EventKind,
  }
  return {
    id: stableCandidateId('event', normalized),
    type: 'event',
    ...normalized,
  }
}

function deduplicate<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const itemKey = key(item)
    if (seen.has(itemKey)) return false
    seen.add(itemKey)
    return true
  })
}

export function normalizePlannerExtraction(value: unknown): PlannerExtractionResult {
  const result = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
  const todos = Array.isArray(result.todos)
    ? result.todos
      .slice(0, PLANNER_EXTRACT_MAX_CANDIDATES_PER_TYPE)
      .map(normalizeTodo)
      .filter((item): item is PlannerTodoCandidate => item !== null)
    : []
  const events = Array.isArray(result.events)
    ? result.events
      .slice(0, PLANNER_EXTRACT_MAX_CANDIDATES_PER_TYPE)
      .map(normalizeEvent)
      .filter((item): item is PlannerEventCandidate => item !== null)
    : []
  return {
    todos: deduplicate(
      todos,
      (item) => `${item.title.toLocaleLowerCase('ko-KR')}:${item.due_date}:${item.due_time}`,
    ),
    events: deduplicate(
      events,
      (item) => `${item.title.toLocaleLowerCase('ko-KR')}:${item.starts_at}`,
    ),
  }
}

function decodedBase64Length(value: string): number {
  if (value.length === 0 || value.length % 4 !== 0) return -1
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return -1
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

function decodeBase64Prefix(value: string): Uint8Array | null {
  try {
    const prefixLength = Math.min(value.length, 32)
    const alignedLength = prefixLength - (prefixLength % 4)
    const binary = atob(value.slice(0, alignedLength))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function hasExpectedImageSignature(mediaType: string, bytes: Uint8Array): boolean {
  const matches = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)
  if (mediaType === 'image/jpeg') return matches(0xff, 0xd8, 0xff)
  if (mediaType === 'image/png') {
    return matches(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  }
  if (mediaType === 'image/gif') {
    const header = new TextDecoder().decode(bytes.slice(0, 6))
    return header === 'GIF87a' || header === 'GIF89a'
  }
  if (mediaType === 'image/webp') {
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
      && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
    )
  }
  return false
}

export function validatePlannerExtractionInput(input: PlannerCaptureInput): void {
  const text = input.text?.trim() ?? ''
  const image = input.imageBase64 ?? ''
  if (!text && !image) throw new Error('메모나 사진을 입력해주세요.')
  if (text.length > PLANNER_EXTRACT_MAX_TEXT_CHARS) {
    throw new Error(`메모는 ${PLANNER_EXTRACT_MAX_TEXT_CHARS.toLocaleString()}자 이하여야 합니다.`)
  }
  if (!image) return

  const mediaType = input.mediaType ?? ''
  if (!SUPPORTED_IMAGE_MEDIA_TYPES.has(mediaType)) {
    throw new Error('JPEG, PNG, GIF 또는 WebP 사진만 사용할 수 있습니다.')
  }
  const bytes = decodedBase64Length(image)
  if (bytes < 0) throw new Error('사진 데이터가 올바른 base64 형식이 아닙니다.')
  if (bytes > PLANNER_EXTRACT_MAX_IMAGE_BYTES) {
    throw new Error('사진은 25MB 이하여야 합니다.')
  }
  const prefix = decodeBase64Prefix(image)
  if (!prefix || !hasExpectedImageSignature(mediaType, prefix)) {
    throw new Error('사진 형식과 실제 파일 내용이 일치하지 않습니다.')
  }
}

async function edgeFunctionMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown }
      if (typeof body.error === 'string' && body.error.trim()) return body.error
    } catch {
      // Use the stable fallback below.
    }
  }
  return fallback
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'
  } catch {
    return 'Asia/Seoul'
  }
}

export async function requestPlannerExtraction(
  client: SupabaseClient,
  input: PlannerCaptureInput,
  specialty: string | null,
  context: PlannerExtractionContext = {},
): Promise<PlannerExtractionResult> {
  validatePlannerExtractionInput(input)
  const body = {
    ...input,
    text: input.text ? redactSensitiveText(input.text) : undefined,
    specialty,
    nowISO: context.nowISO ?? new Date().toISOString(),
    timeZone: context.timeZone ?? browserTimeZone(),
  }
  const { data, error } = await client.functions.invoke('extract-planner-items', {
    body,
  })
  if (error) {
    throw new Error(await edgeFunctionMessage(
      error,
      '메모·사진 분석 서버에 연결할 수 없습니다.',
    ))
  }
  if (
    typeof data !== 'object'
    || data === null
    || !Array.isArray(data.todos)
    || !Array.isArray(data.events)
  ) {
    throw new Error('AI 분석 결과 형식이 올바르지 않습니다.')
  }
  return normalizePlannerExtraction(data)
}
