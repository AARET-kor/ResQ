import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoSection } from './TodoSection'
import type { Todo } from '../../lib/todos'
import type { ExtractedTodo } from '../../lib/todoExtract'

const todos: Todo[] = [
  { id: 't1', user_id: 'u1', title: '회진 준비', done: false, due_date: null, xp_granted: false, priority: 'normal', due_time: null },
  { id: 't2', user_id: 'u1', title: '컨퍼런스 발표', done: true, due_date: '2026-07-20', xp_granted: true, priority: 'normal', due_time: null },
]

describe('TodoSection', () => {
  it('renders todos with their done state', () => {
    render(<TodoSection todos={todos} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('회진 준비')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /컨퍼런스 발표/ })).toBeChecked()
  })

  it('adds a todo via the form with default priority and no due date/time', async () => {
    const onAdd = vi.fn()
    render(<TodoSection todos={[]} onAdd={onAdd} onToggle={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('할 일 추가'), '논문 읽기')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(onAdd).toHaveBeenCalledWith('논문 읽기', { priority: 'normal', dueDate: null, dueTime: null })
  })

  it('adds a todo with a selected priority and due date/time', async () => {
    const onAdd = vi.fn()
    render(<TodoSection todos={[]} onAdd={onAdd} onToggle={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('할 일 추가'), '논문 읽기')
    await userEvent.click(screen.getByRole('button', { name: '우선순위 높음' }))
    await userEvent.type(screen.getByLabelText('마감일'), '2026-07-22')
    await userEvent.type(screen.getByLabelText('마감 시간'), '08:30')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(onAdd).toHaveBeenCalledWith('논문 읽기', { priority: 'high', dueDate: '2026-07-22', dueTime: '08:30' })
  })

  it('keeps the draft when saving fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false)
    render(<TodoSection todos={[]} onAdd={onAdd} onToggle={vi.fn()} onDelete={vi.fn()} />)
    const input = screen.getByLabelText('할 일 추가')
    await userEvent.type(input, '회진 준비')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(input).toHaveValue('회진 준비')
  })

  it('shows a loading skeleton and disables a pending row', () => {
    const { rerender } = render(
      <TodoSection todos={[]} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} loading />,
    )
    expect(screen.getByLabelText('할 일 불러오는 중')).toBeInTheDocument()
    rerender(
      <TodoSection
        todos={[todos[0]]}
        onAdd={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        pendingIds={new Set(['t1'])}
      />,
    )
    expect(screen.getByRole('checkbox', { name: '회진 준비' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
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

  it('renders the list sorted by priority (high before low) via sortTodos', () => {
    const mixed: Todo[] = [
      { id: 'low', user_id: 'u1', title: '낮은 일', done: false, due_date: null, xp_granted: false, priority: 'low', due_time: null },
      { id: 'high', user_id: 'u1', title: '높은 일', done: false, due_date: null, xp_granted: false, priority: 'high', due_time: null },
    ]
    render(<TodoSection todos={mixed} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />)
    const items = screen.getAllByRole('listitem')
    const titles = items.map((li) => li.textContent)
    const highIdx = titles.findIndex((t) => t?.includes('높은 일'))
    const lowIdx = titles.findIndex((t) => t?.includes('낮은 일'))
    expect(highIdx).toBeLessThan(lowIdx)
  })

  it('shows a due chip and priority chip for todos that have them', () => {
    const withDue: Todo[] = [
      { id: 'd1', user_id: 'u1', title: '초록 제출', done: false, due_date: '2026-07-22', xp_granted: false, priority: 'high', due_time: '08:30' },
    ]
    render(<TodoSection todos={withDue} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />)
    const row = screen.getByText('초록 제출').closest('li')!
    expect(within(row).getByText('7/22 08:30')).toBeInTheDocument()
    expect(within(row).getByText('높음')).toBeInTheDocument()
  })

  it('paste zone: plain text triggers onExtract({ text })', () => {
    const onExtract = vi.fn()
    render(<TodoSection todos={[]} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} onExtract={onExtract} />)
    const zone = screen.getByLabelText('할일 붙여넣기 존')
    fireEvent.paste(zone, { clipboardData: { items: [], getData: () => '회진 준비' } })
    expect(onExtract).toHaveBeenCalledWith({ text: '회진 준비' })
  })

  it('paste zone: image item triggers onExtract with base64 + mediaType', async () => {
    const onExtract = vi.fn()
    render(<TodoSection todos={[]} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} onExtract={onExtract} />)
    const zone = screen.getByLabelText('할일 붙여넣기 존')
    const file = new File(['fake-image-bytes'], 'memo.png', { type: 'image/png' })
    const imageItem = { type: 'image/png', getAsFile: () => file }
    fireEvent.paste(zone, { clipboardData: { items: [imageItem], getData: () => '' } })
    await waitFor(() => expect(onExtract).toHaveBeenCalled())
    const arg = onExtract.mock.calls[0][0]
    expect(arg.mediaType).toBe('image/png')
    expect(typeof arg.imageBase64).toBe('string')
    expect(arg.imageBase64.length).toBeGreaterThan(0)
  })

  it('shows the extracting indicator while AI extraction is in flight', () => {
    render(<TodoSection todos={[]} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} extracting />)
    expect(screen.getByText('AI가 할일을 뽑는 중…')).toBeInTheDocument()
  })

  it('renders an extracted review list with per-row add and a header dismiss', async () => {
    const onAddExtracted = vi.fn()
    const onDismissExtracted = vi.fn()
    const extracted: ExtractedTodo[] = [
      { title: '초록 제출', due_date: '2026-07-25', due_time: '17:00', priority: 'high' },
    ]
    render(
      <TodoSection
        todos={[]}
        onAdd={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        extracted={extracted}
        onAddExtracted={onAddExtracted}
        onDismissExtracted={onDismissExtracted}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '할일에 추가' }))
    expect(onAddExtracted).toHaveBeenCalledWith(extracted[0])
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onDismissExtracted).toHaveBeenCalled()
  })

  describe('voice input (SpeechRecognition capability gate)', () => {
    afterEach(() => {
      delete (window as any).webkitSpeechRecognition
    })

    it('hides the mic button when SpeechRecognition is unavailable (default jsdom)', () => {
      render(<TodoSection todos={[]} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />)
      expect(screen.queryByRole('button', { name: '음성 입력' })).not.toBeInTheDocument()
    })

    it('shows the mic button when webkitSpeechRecognition is stubbed, and pulses while listening', async () => {
      class FakeRecognition {
        lang = ''
        start() {}
        stop() {}
        onresult: ((e: unknown) => void) | null = null
        onerror: (() => void) | null = null
        onend: (() => void) | null = null
      }
      ;(window as any).webkitSpeechRecognition = FakeRecognition

      render(<TodoSection todos={[]} onAdd={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />)
      const mic = screen.getByRole('button', { name: '음성 입력' })
      expect(mic.className).not.toMatch(/animate-pulse/)
      await userEvent.click(mic)
      expect(mic.className).toMatch(/animate-pulse/)
    })
  })
})
