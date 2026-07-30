import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EventItem } from '../../lib/events'
import type { IntegrationSource } from '../../lib/integrations'
import type { Todo } from '../../lib/todos'
import { PlanWorkstation } from './PlanWorkstation'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  } satisfies Storage
}

const events: EventItem[] = [
  {
    id: 'event-resq',
    user_id: 'user-1',
    title: 'ResQ 컨퍼런스 준비',
    starts_at: '2026-07-10T09:00:00+09:00',
    ends_at: null,
    kind: 'conference',
    location: null,
    notes: null,
    source_provider: null,
    external_source_id: null,
    sync_status: 'synced',
  },
  {
    id: 'event-google',
    user_id: 'user-1',
    title: 'Google 외래 일정',
    starts_at: '2026-07-11T13:30:00+09:00',
    ends_at: null,
    kind: 'other',
    location: null,
    notes: null,
    source_provider: 'google',
    external_source_id: 'google-calendar',
    sync_status: 'synced',
  },
]

const todos: Todo[] = [
  {
    id: 'todo-resq',
    user_id: 'user-1',
    title: 'ResQ 초록 제출',
    done: false,
    due_date: '2026-07-12',
    due_time: '18:00',
    xp_granted: false,
    priority: 'high',
    source_provider: null,
    external_source_id: null,
    sync_status: 'synced',
  },
  {
    id: 'todo-google',
    user_id: 'user-1',
    title: 'Google 자료 검토',
    done: false,
    due_date: '2026-07-13',
    due_time: null,
    xp_granted: false,
    priority: 'normal',
    source_provider: 'google',
    external_source_id: 'google-tasks',
    sync_status: 'synced',
  },
]

const sources: IntegrationSource[] = [
  {
    id: 'source-google-calendar',
    user_id: 'user-1',
    connection_id: 'connection-google',
    provider: 'google',
    resource_type: 'calendar',
    external_id: 'google-calendar',
    name: '업무 캘린더',
    color: '#4285f4',
    selected: true,
    is_default: true,
    can_write: true,
    sync_mode: 'two_way',
    metadata: {},
    last_synced_at: null,
    last_error: null,
  },
  {
    id: 'source-google-tasks',
    user_id: 'user-1',
    connection_id: 'connection-google',
    provider: 'google',
    resource_type: 'task_list',
    external_id: 'google-tasks',
    name: '업무 할 일',
    color: '#4285f4',
    selected: true,
    is_default: true,
    can_write: true,
    sync_mode: 'two_way',
    metadata: {},
    last_synced_at: null,
    last_error: null,
  },
]

function renderWorkstation(overrides: Partial<Parameters<typeof PlanWorkstation>[0]> = {}) {
  const props: Parameters<typeof PlanWorkstation>[0] = {
    userId: 'user-1',
    events,
    todos,
    sources,
    year: 2026,
    month0: 6,
    onMonthChange: vi.fn(),
    onAddEvent: vi.fn(),
    onAddTodo: vi.fn(),
    onToggleTodo: vi.fn(),
    ...overrides,
  }
  return {
    ...render(<PlanWorkstation {...props} />),
    props,
  }
}

describe('PlanWorkstation', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('switches between month, week, agenda and tasks views', async () => {
    const user = userEvent.setup()
    renderWorkstation()

    expect(screen.getByLabelText('2026년 7월 통합 달력')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '주간' }))
    expect(screen.getByLabelText('주간 통합 보기')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '아젠다' }))
    expect(screen.getByLabelText('통합 아젠다')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByLabelText('할 일 워크스페이스')).toBeInTheDocument()
  })

  it('quick-adds ResQ-only events and todos with explicit sync metadata', async () => {
    const user = userEvent.setup()
    const onAddEvent = vi.fn().mockResolvedValue(true)
    const onAddTodo = vi.fn().mockResolvedValue(true)
    renderWorkstation({ onAddEvent, onAddTodo })

    await user.click(screen.getByRole('button', { name: '통합 추가' }))
    let form = screen.getByRole('form', { name: '통합 추가' })
    await user.type(within(form).getByLabelText('제목'), '중환자실 컨퍼런스')
    await user.clear(within(form).getByLabelText('시작일'))
    await user.type(within(form).getByLabelText('시작일'), '2026-07-21')
    await user.clear(within(form).getByLabelText('시간'))
    await user.type(within(form).getByLabelText('시간'), '08:40')
    await user.selectOptions(within(form).getByLabelText('종류'), 'conference')
    await user.click(within(form).getByRole('button', { name: '일정 저장' }))

    expect(onAddEvent).toHaveBeenCalledWith({
      title: '중환자실 컨퍼런스',
      starts_at: '2026-07-21T08:40:00+09:00',
      ends_at: null,
      kind: 'conference',
      source_provider: null,
      external_source_id: null,
      sync_status: 'synced',
    })

    await user.click(screen.getByRole('button', { name: '통합 추가' }))
    form = screen.getByRole('form', { name: '통합 추가' })
    await user.click(within(form).getByRole('button', { name: '할 일' }))
    await user.type(within(form).getByLabelText('제목'), '퇴원 요약 작성')
    await user.clear(within(form).getByLabelText('마감일'))
    await user.type(within(form).getByLabelText('마감일'), '2026-07-22')
    await user.clear(within(form).getByLabelText('시간'))
    await user.type(within(form).getByLabelText('시간'), '17:20')
    await user.selectOptions(within(form).getByLabelText('우선순위'), 'high')
    await user.click(within(form).getByRole('button', { name: '할 일 저장' }))

    expect(onAddTodo).toHaveBeenCalledWith('퇴원 요약 작성', {
      priority: 'high',
      dueDate: '2026-07-22',
      dueTime: '17:20',
      sourceProvider: null,
      externalSourceId: null,
      syncStatus: 'synced',
    })
  })

  it('targets a writable connected calendar for a multi-day event', async () => {
    const user = userEvent.setup()
    const onAddEvent = vi.fn().mockResolvedValue(true)
    renderWorkstation({ onAddEvent })

    await user.click(screen.getByRole('button', { name: '통합 추가' }))
    const form = screen.getByRole('form', { name: '통합 추가' })
    await user.type(within(form).getByLabelText('제목'), '여름 학회')
    await user.clear(within(form).getByLabelText('시작일'))
    await user.type(within(form).getByLabelText('시작일'), '2026-07-21')
    await user.type(within(form).getByLabelText('종료일 · 여러 날 일정'), '2026-07-24')
    await user.selectOptions(within(form).getByLabelText('저장 위치'), 'source-google-calendar')
    await user.click(within(form).getByRole('button', { name: '일정 저장' }))

    expect(onAddEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: '여름 학회',
      starts_at: '2026-07-21T09:00:00+09:00',
      ends_at: '2026-07-24T09:00:00+09:00',
      source_provider: 'google',
      external_source_id: 'google-calendar',
      sync_status: 'pending',
    }))
  })

  it('filters the unified calendar by provider and toggles a task', async () => {
    const user = userEvent.setup()
    const onToggleTodo = vi.fn()
    renderWorkstation({ onToggleTodo })

    expect(screen.getByText('ResQ 컨퍼런스 준비')).toBeInTheDocument()
    expect(screen.getByText('Google 외래 일정')).toBeInTheDocument()

    const providerFilters = screen.getByLabelText('출처 필터')
    await user.click(within(providerFilters).getByRole('button', { name: 'Google' }))
    expect(screen.queryByText('ResQ 컨퍼런스 준비')).not.toBeInTheDocument()
    expect(screen.getByText('Google 외래 일정')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    await user.click(screen.getByRole('checkbox', { name: /Google 자료 검토/ }))
    expect(onToggleTodo).toHaveBeenCalledWith(todos[1])
  })

  it('collapses duplicate agenda entries and identifies the merged sources', async () => {
    const user = userEvent.setup()
    renderWorkstation({
      events: [
        events[0],
        {
          ...events[0],
          id: 'event-google-duplicate',
          source_provider: 'google',
          external_source_id: 'google-calendar',
          external_updated_at: '2026-07-09T11:00:00Z',
        },
      ],
    })

    await user.click(screen.getByRole('button', { name: '아젠다' }))
    expect(screen.getAllByText('ResQ 컨퍼런스 준비')).toHaveLength(1)
    expect(screen.getByText('중복 2개 통합')).toBeInTheDocument()
  })
})
