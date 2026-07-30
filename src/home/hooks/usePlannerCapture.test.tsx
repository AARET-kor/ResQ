import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  EventDraft,
  TodoDraftOptions,
} from '../../components/sections/planner/workstationShared'
import type { PlannerCandidate } from '../../lib/plannerExtract'

const { notify, requestPlannerExtraction } = vi.hoisted(() => ({
  notify: vi.fn(),
  requestPlannerExtraction: vi.fn(),
}))

vi.mock('../../feedback/notificationContext', () => ({
  useNotifications: () => ({ notify, dismiss: vi.fn() }),
}))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/plannerExtract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/plannerExtract')>()
  return { ...actual, requestPlannerExtraction }
})

import { usePlannerCapture } from './usePlannerCapture'

const eventCandidate: PlannerCandidate = {
  id: 'event-1',
  type: 'event',
  title: '컨퍼런스',
  starts_at: '2026-07-31T09:00:00+09:00',
  ends_at: null,
  location: null,
  notes: null,
  kind: 'conference',
}
const todoCandidate: PlannerCandidate = {
  id: 'todo-1',
  type: 'todo',
  title: '초록 제출',
  due_date: '2026-08-01',
  due_time: '17:00',
  priority: 'high',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function Probe({
  onAddEvent,
  onAddTodo,
}: {
  onAddEvent: (event: EventDraft) => Promise<boolean>
  onAddTodo: (
    title: string,
    options: TodoDraftOptions,
  ) => Promise<boolean>
}) {
  const capture = usePlannerCapture({
    specialty: '정형외과',
    onAddEvent,
    onAddTodo,
  })
  return (
    <>
      <span data-testid="candidate-count">{capture.candidates.length}</span>
      <button
        type="button"
        onClick={() => void capture.extract({ text: '메모' })}
      >
        분석
      </button>
      <button
        type="button"
        onClick={() => void capture.saveSelected()}
      >
        선택 저장
      </button>
    </>
  )
}

describe('usePlannerCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestPlannerExtraction.mockResolvedValue({
      events: [eventCandidate],
      todos: [todoCandidate],
    })
  })

  it('saves mixed AI candidates sequentially and clears successes', async () => {
    const eventSave = deferred<boolean>()
    const todoSave = deferred<boolean>()
    const onAddEvent = vi.fn(() => eventSave.promise)
    const onAddTodo = vi.fn(() => todoSave.promise)
    const user = userEvent.setup()
    render(<Probe onAddEvent={onAddEvent} onAddTodo={onAddTodo} />)

    await user.click(screen.getByRole('button', { name: '분석' }))
    await waitFor(() => {
      expect(screen.getByTestId('candidate-count')).toHaveTextContent('2')
    })

    await user.click(screen.getByRole('button', { name: '선택 저장' }))
    expect(onAddEvent).toHaveBeenCalledTimes(1)
    expect(onAddTodo).not.toHaveBeenCalled()

    await act(async () => { eventSave.resolve(true) })
    await waitFor(() => expect(onAddTodo).toHaveBeenCalledTimes(1))

    await act(async () => { todoSave.resolve(true) })
    await waitFor(() => {
      expect(screen.getByTestId('candidate-count')).toHaveTextContent('0')
    })
  })

  it('keeps failed candidates available for retry', async () => {
    const onAddEvent = vi.fn().mockResolvedValue(false)
    const onAddTodo = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<Probe onAddEvent={onAddEvent} onAddTodo={onAddTodo} />)

    await user.click(screen.getByRole('button', { name: '분석' }))
    await waitFor(() => {
      expect(screen.getByTestId('candidate-count')).toHaveTextContent('2')
    })
    await user.click(screen.getByRole('button', { name: '선택 저장' }))

    await waitFor(() => {
      expect(screen.getByTestId('candidate-count')).toHaveTextContent('1')
    })
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({
      tone: 'warning',
    }))
  })
})
