import { describe, expect, it, vi } from 'vitest'
import {
  normalizePlannerExtraction,
  PLANNER_EXTRACT_MAX_TEXT_CHARS,
  requestPlannerExtraction,
  validatePlannerExtractionInput,
} from './plannerExtract'

function client(result: unknown) {
  return {
    functions: {
      invoke: vi.fn().mockResolvedValue(result),
    },
  } as any
}

function base64(...bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

const PNG = base64(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0)

describe('planner extraction input validation', () => {
  it('accepts a supported image whose MIME and magic bytes agree', () => {
    expect(() => validatePlannerExtractionInput({
      imageBase64: PNG,
      mediaType: 'image/png',
    })).not.toThrow()
  })

  it('rejects empty, oversized-text and mismatched image inputs before invoking AI', () => {
    expect(() => validatePlannerExtractionInput({})).toThrow(/입력/)
    expect(() => validatePlannerExtractionInput({
      text: '가'.repeat(PLANNER_EXTRACT_MAX_TEXT_CHARS + 1),
    })).toThrow(/100,000자/)
    expect(() => validatePlannerExtractionInput({
      imageBase64: PNG,
      mediaType: 'image/jpeg',
    })).toThrow(/일치하지/)
  })
})

describe('normalizePlannerExtraction', () => {
  it('normalizes a mixed response, attaches deterministic discriminated ids and notes', () => {
    const raw = {
      todos: [{
        title: '  초록 제출  ',
        due_date: '2026-08-04',
        due_time: '17:30',
        priority: 'high',
      }],
      events: [{
        title: '  정형외과 집담회 ',
        starts_at: '2026-08-05T08:00:00+09:00',
        ends_at: '2026-08-05T09:00:00+09:00',
        location: '  본관 회의실 ',
        notes: ' 발표 자료 지참 ',
        kind: 'conference',
      }],
    }
    const first = normalizePlannerExtraction(raw)
    const second = normalizePlannerExtraction(raw)

    expect(first.todos[0]).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^todo-/),
      type: 'todo',
      title: '초록 제출',
      priority: 'high',
    }))
    expect(first.events[0]).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^event-/),
      type: 'event',
      title: '정형외과 집담회',
      location: '본관 회의실',
      notes: '발표 자료 지참',
    }))
    expect(second.todos[0].id).toBe(first.todos[0].id)
    expect(second.events[0].id).toBe(first.events[0].id)
  })

  it('drops invalid dates, times, ranges and schemas while normalizing priority', () => {
    const result = normalizePlannerExtraction({
      todos: [
        { title: '정상', due_date: null, due_time: null, priority: 'urgent' },
        { title: '없는 날짜', due_date: '2026-02-30', due_time: null, priority: 'high' },
        { title: '없는 시간', due_date: '2026-08-01', due_time: '29:10', priority: 'low' },
        { title: '날짜 없는 시간', due_date: null, due_time: '09:00', priority: 'normal' },
      ],
      events: [
        {
          title: '정상 일정',
          starts_at: '2026-08-02T09:00:00+09:00',
          ends_at: null,
          location: null,
          notes: null,
          kind: 'other',
        },
        {
          title: '시간대 없음',
          starts_at: '2026-08-02T09:00:00',
          kind: 'other',
        },
        {
          title: '역전 일정',
          starts_at: '2026-08-02T09:00:00+09:00',
          ends_at: '2026-08-02T08:00:00+09:00',
          kind: 'conference',
        },
      ],
    })

    expect(result.todos).toHaveLength(1)
    expect(result.todos[0].priority).toBe('normal')
    expect(result.events).toHaveLength(1)
    expect(result.events[0].title).toBe('정상 일정')
  })

  it('deduplicates equivalent candidates', () => {
    const todo = {
      title: '초록 제출',
      due_date: '2026-08-04',
      due_time: '17:30',
      priority: 'high',
    }
    const event = {
      title: '집담회',
      starts_at: '2026-08-05T08:00:00+09:00',
      ends_at: null,
      location: null,
      notes: null,
      kind: 'conference',
    }
    const result = normalizePlannerExtraction({
      todos: [todo, { ...todo }],
      events: [event, { ...event }],
    })
    expect(result.todos).toHaveLength(1)
    expect(result.events).toHaveLength(1)
  })
})

describe('requestPlannerExtraction', () => {
  it('redacts text, sends temporal context and returns validated mixed candidates', async () => {
    const c = client({
      data: {
        todos: [{
          title: '자료 준비',
          due_date: '2026-08-04',
          due_time: null,
          priority: 'normal',
        }],
        events: [{
          title: '집담회',
          starts_at: '2026-08-05T08:00:00+09:00',
          ends_at: null,
          location: null,
          notes: null,
          kind: 'conference',
        }],
      },
      error: null,
    })
    const result = await requestPlannerExtraction(
      c,
      { text: '환자명: 김철수 자료 준비' },
      '정형외과',
      {
        nowISO: '2026-07-30T00:00:00.000Z',
        timeZone: 'Asia/Seoul',
      },
    )

    expect(result.todos).toHaveLength(1)
    expect(result.events).toHaveLength(1)
    const invoke = c.functions.invoke
    expect(invoke).toHaveBeenCalledWith(
      'extract-planner-items',
      expect.objectContaining({
        body: expect.objectContaining({
          specialty: '정형외과',
          nowISO: '2026-07-30T00:00:00.000Z',
          timeZone: 'Asia/Seoul',
        }),
      }),
    )
    expect(invoke.mock.calls[0][1].body.text).not.toContain('김철수')
  })

  it('surfaces a structured Edge Function error', async () => {
    const context = Response.json(
      { error: '사진은 25MB 이하여야 합니다.' },
      { status: 413 },
    )
    const c = client({ data: null, error: { context } })
    await expect(requestPlannerExtraction(
      c,
      { text: '메모' },
      null,
    )).rejects.toThrow(/25MB/)
  })

  it('rejects malformed success payloads', async () => {
    const c = client({ data: { todos: [] }, error: null })
    await expect(requestPlannerExtraction(
      c,
      { text: '메모' },
      null,
    )).rejects.toThrow(/결과 형식/)
  })
})
