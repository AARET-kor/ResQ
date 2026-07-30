import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EventItem } from '../../../lib/events'
import type { IntegrationSource } from '../../../lib/integrations'
import type { Todo } from '../../../lib/todos'
import { PlannerInspector } from './PlannerInspector'

const event: EventItem = {
  id: 'event-1',
  user_id: 'user-1',
  title: '교수님 미팅',
  starts_at: '2026-08-03T15:00:00+09:00',
  ends_at: '2026-08-03T16:00:00+09:00',
  kind: 'professor',
  location: '연구실',
  notes: '초록 방향 논의',
  source_provider: null,
  sync_status: 'synced',
}

const todo: Todo = {
  id: 'todo-1',
  user_id: 'user-1',
  title: '초록 제출',
  done: false,
  due_date: '2026-08-03',
  due_time: '17:00',
  xp_granted: false,
  priority: 'high',
  source_provider: null,
  sync_status: 'synced',
}

const googleSource: IntegrationSource = {
  id: 'source-google',
  user_id: 'user-1',
  connection_id: 'connection-google',
  provider: 'google',
  resource_type: 'task_list',
  external_id: 'google-tasks',
  name: '업무 할 일',
  color: '#4285f4',
  selected: true,
  is_default: true,
  can_write: false,
  sync_mode: 'read_only',
  metadata: {},
  last_synced_at: null,
  last_error: null,
}

describe('PlannerInspector', () => {
  it('lists every item on the selected date and opens a chosen item', async () => {
    const user = userEvent.setup()
    const onSelectItem = vi.fn()
    render(
      <PlannerInspector
        selectedDate="2026-08-03"
        events={[event]}
        todos={[todo]}
        sources={[]}
        onSelectItem={onSelectItem}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('교수님 미팅')).toBeInTheDocument()
    expect(screen.getByText('초록 제출')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /초록 제출/ }))
    expect(onSelectItem).toHaveBeenCalledWith({ type: 'todo', todo })
  })

  it('shows event details and confirms deletion', async () => {
    const user = userEvent.setup()
    const onDeleteEvent = vi.fn()
    render(
      <PlannerInspector
        selectedDate="2026-08-03"
        selection={{ type: 'event', event }}
        events={[event]}
        todos={[]}
        sources={[]}
        onDeleteEvent={onDeleteEvent}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('연구실')).toBeInTheDocument()
    expect(screen.getByText('초록 방향 논의')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제' }))
    const confirmation = screen.getByRole('group', { name: '삭제 확인' })
    await user.click(
      within(confirmation).getByRole('button', { name: '삭제 확인' }),
    )
    expect(onDeleteEvent).toHaveBeenCalledWith('event-1')
  })

  it('allows completing a local todo', async () => {
    const user = userEvent.setup()
    const onToggleTodo = vi.fn()
    render(
      <PlannerInspector
        selection={{ type: 'todo', todo }}
        events={[]}
        todos={[todo]}
        sources={[]}
        onToggleTodo={onToggleTodo}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '완료' }))
    expect(onToggleTodo).toHaveBeenCalledWith(todo)
  })

  it('fails closed for a read-only external item and keeps original-app access', () => {
    const externalTodo: Todo = {
      ...todo,
      source_provider: 'google',
      external_source_id: 'google-tasks',
      external_url: 'https://tasks.google.com/task/todo-1',
    }
    render(
      <PlannerInspector
        selection={{ type: 'todo', todo: externalTodo }}
        events={[]}
        todos={[externalTodo]}
        sources={[googleSource]}
        readOnlySourceKeys={new Set(['google:google-tasks'])}
        onToggleTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/읽기 전용 연결입니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '완료' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '원본 앱' })).toHaveAttribute(
      'href',
      externalTodo.external_url,
    )
  })

  it('treats incomplete external source metadata as read-only', () => {
    const incompleteExternalTodo: Todo = {
      ...todo,
      source_provider: 'google',
      external_source_id: null,
    }
    render(
      <PlannerInspector
        selection={{ type: 'todo', todo: incompleteExternalTodo }}
        events={[]}
        todos={[incompleteExternalTodo]}
        sources={[]}
        onToggleTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '완료' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
  })
})
