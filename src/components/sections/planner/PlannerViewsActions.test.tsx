import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EventItem } from '../../../lib/events'
import type { IntegrationSource } from '../../../lib/integrations'
import type { Todo } from '../../../lib/todos'
import { PlannerAgendaView } from './PlannerAgendaView'
import { PlannerMonthView } from './PlannerMonthView'
import { PlannerTasksView } from './PlannerTasksView'
import { PlannerWeekView } from './PlannerWeekView'

const event: EventItem = {
  id: 'event-1',
  user_id: 'user-1',
  title: '교수님 미팅',
  starts_at: '2026-08-03T15:00:00+09:00',
  ends_at: null,
  kind: 'professor',
  location: null,
  notes: null,
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

describe('planner view item actions', () => {
  it('opens a month item and keeps its date selected', async () => {
    const user = userEvent.setup()
    const onSelectDate = vi.fn()
    const onSelectItem = vi.fn()
    render(
      <PlannerMonthView
        year={2026}
        month0={7}
        events={[event]}
        todos={[todo]}
        sources={[]}
        selectedDate="2026-08-03"
        decorations={{}}
        onSelectDate={onSelectDate}
        onOpenCapture={vi.fn()}
        onSelectItem={onSelectItem}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '교수님 미팅 일정 상세 보기' }),
    )
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-03')
    expect(onSelectItem).toHaveBeenCalledWith({ type: 'event', event })
  })

  it('opens week items and disables read-only task completion', async () => {
    const user = userEvent.setup()
    const externalTodo: Todo = {
      ...todo,
      source_provider: 'google',
      external_source_id: 'google-tasks',
    }
    const onSelectItem = vi.fn()
    render(
      <PlannerWeekView
        selectedDate="2026-08-03"
        events={[event]}
        todos={[externalTodo]}
        sources={[googleSource]}
        decorations={{}}
        onSelectDate={vi.fn()}
        onOpenCapture={vi.fn()}
        onToggleTodo={vi.fn()}
        onSelectItem={onSelectItem}
        readOnlySourceKeys={new Set(['google:google-tasks'])}
      />,
    )

    expect(screen.getByRole('checkbox', { name: '초록 제출' })).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: '초록 제출 할 일 상세 보기' }),
    )
    expect(onSelectItem).toHaveBeenCalledWith({
      type: 'todo',
      todo: externalTodo,
    })
  })

  it('deletes local tasks but disables deletion for read-only tasks', async () => {
    const user = userEvent.setup()
    const externalTodo: Todo = {
      ...todo,
      id: 'todo-external',
      title: 'Google 자료 검토',
      source_provider: 'google',
      external_source_id: 'google-tasks',
      external_url: 'https://tasks.google.com/task/todo-external',
    }
    const onDeleteTodo = vi.fn()
    render(
      <PlannerTasksView
        todos={[todo, externalTodo]}
        sources={[googleSource]}
        readOnlySourceKeys={new Set(['google:google-tasks'])}
        pendingTodoIds={new Set()}
        onToggleTodo={vi.fn()}
        onAddTodo={vi.fn()}
        onDeleteTodo={onDeleteTodo}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '초록 제출 삭제' }),
    )
    expect(onDeleteTodo).toHaveBeenCalledWith('todo-1')
    expect(
      screen.getByRole('button', { name: 'Google 자료 검토 삭제' }),
    ).toBeDisabled()
    expect(screen.getByText('읽기 전용')).toBeInTheDocument()
  })

  it('opens and deletes an agenda event', async () => {
    const user = userEvent.setup()
    const onSelectItem = vi.fn()
    const onDeleteEvent = vi.fn()
    render(
      <PlannerAgendaView
        visibleEvents={[event]}
        visibleTodos={[]}
        sources={[]}
        readOnlySourceKeys={new Set()}
        pendingTodoIds={new Set()}
        onToggleTodo={vi.fn()}
        onSelectItem={onSelectItem}
        onDeleteEvent={onDeleteEvent}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '교수님 미팅 상세 보기' }),
    )
    expect(onSelectItem).toHaveBeenCalledWith({ type: 'event', event })
    await user.click(
      screen.getByRole('button', { name: '교수님 미팅 일정 삭제' }),
    )
    expect(onDeleteEvent).toHaveBeenCalledWith('event-1')
  })
})
