import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoSection } from './TodoSection'
import type { Todo } from '../../lib/todos'

const todos: Todo[] = [
  { id: 't1', user_id: 'u1', title: '회진 준비', done: false, due_date: null, xp_granted: false },
  { id: 't2', user_id: 'u1', title: '컨퍼런스 발표', done: true, due_date: '2026-07-20', xp_granted: true },
]

describe('TodoSection', () => {
  it('renders todos with their done state', () => {
    render(<TodoSection todos={todos} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('회진 준비')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /컨퍼런스 발표/ })).toBeChecked()
  })
  it('adds a todo via the form', async () => {
    const onAdd = vi.fn()
    render(<TodoSection todos={[]} onAdd={onAdd} onToggle={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('할 일 추가'), '논문 읽기')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(onAdd).toHaveBeenCalledWith('논문 읽기')
  })
  it('does not add empty todos', async () => {
    const onAdd = vi.fn()
    render(<TodoSection todos={[]} onAdd={onAdd} onToggle={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(onAdd).not.toHaveBeenCalled()
  })
  it('toggles and deletes', async () => {
    const onToggle = vi.fn()
    const onDelete = vi.fn()
    render(<TodoSection todos={todos} onAdd={vi.fn()} onToggle={onToggle} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /회진 준비/ }))
    expect(onToggle).toHaveBeenCalledWith(todos[0])
    await userEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])
    expect(onDelete).toHaveBeenCalledWith('t1')
  })
})
