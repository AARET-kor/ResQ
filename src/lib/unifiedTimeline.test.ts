import { describe, expect, it } from 'vitest'
import { buildUnifiedTimeline, normalizeTimelineTitle } from './unifiedTimeline'
import type { EventItem } from './events'
import type { Todo } from './todos'

describe('unified timeline', () => {
  it('normalizes punctuation and Korean spacing for duplicate detection', () => {
    expect(normalizeTimelineTitle('[외래] 학회 등록!')).toBe('학회등록')
  })

  it('collapses matching cross-provider events within ten minutes', () => {
    const events = [
      {
        id: 'a',
        title: '대한 학회',
        starts_at: '2026-07-28T01:00:00Z',
        source_provider: 'google',
      },
      {
        id: 'b',
        title: '대한학회',
        starts_at: '2026-07-28T01:04:00Z',
        source_provider: 'microsoft',
        external_url: 'https://outlook.office.com/',
      },
    ] as EventItem[]
    const timeline = buildUnifiedTimeline(events, [], [])
    expect(timeline).toHaveLength(1)
    expect(timeline[0].duplicateCount).toBe(2)
    expect(timeline[0].duplicateProviders).toEqual(['google', 'microsoft'])
    expect(timeline[0].externalUrl).toBe('https://outlook.office.com/')
  })

  it('keeps tasks with different due dates separate', () => {
    const todos = [
      { id: 'a', title: '초록 제출', due_date: '2026-07-28', source_provider: 'google' },
      { id: 'b', title: '초록 제출', due_date: '2026-07-29', source_provider: 'todoist' },
    ] as Todo[]
    expect(buildUnifiedTimeline([], todos, [])).toHaveLength(2)
  })
})
