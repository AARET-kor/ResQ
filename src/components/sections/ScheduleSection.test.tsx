import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleSection } from './ScheduleSection'
import type { EventItem } from '../../lib/events'

const events: EventItem[] = [
  { id: 'e1', user_id: 'u1', title: '대한내과학회', starts_at: '2026-07-20T09:00:00+09:00', ends_at: null, kind: 'conference', location: '코엑스', notes: null },
]

describe('ScheduleSection', () => {
  it('renders the month title, grid and events', () => {
    render(<ScheduleSection events={events} year={2026} month0={6}
      onMonthChange={vi.fn()} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('2026년 7월')).toBeInTheDocument()
    const eventTitle = screen.getByText('대한내과학회')
    expect(eventTitle).toBeInTheDocument()
    // Scope to the event row: the kind label "학회" also appears (as an
    // unrelated exact match) in the add-event <select>'s option list.
    const row = eventTitle.closest('li')!
    expect(within(row).getByText('학회')).toBeInTheDocument()
  })
  it('navigates months', async () => {
    const onMonthChange = vi.fn()
    render(<ScheduleSection events={[]} year={2026} month0={6}
      onMonthChange={onMonthChange} onAdd={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 7)
    await userEvent.click(screen.getByRole('button', { name: '이전 달' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 5)
  })
  it('wraps the year when navigating from December', async () => {
    const onMonthChange = vi.fn()
    render(<ScheduleSection events={[]} year={2026} month0={11}
      onMonthChange={onMonthChange} onAdd={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(onMonthChange).toHaveBeenCalledWith(2027, 0)
  })
  it('submits a new event', async () => {
    const onAdd = vi.fn()
    render(<ScheduleSection events={[]} year={2026} month0={6}
      onMonthChange={vi.fn()} onAdd={onAdd} onDelete={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('일정 제목'), '수술 참관')
    await userEvent.type(screen.getByLabelText('날짜'), '2026-07-22')
    await userEvent.type(screen.getByLabelText('시간'), '08:30')
    await userEvent.selectOptions(screen.getByLabelText('종류'), 'surgery')
    await userEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    expect(onAdd).toHaveBeenCalledWith({
      title: '수술 참관',
      starts_at: '2026-07-22T08:30:00+09:00',
      kind: 'surgery',
    })
  })
  it('deletes an event', async () => {
    const onDelete = vi.fn()
    render(<ScheduleSection events={events} year={2026} month0={6}
      onMonthChange={vi.fn()} onAdd={vi.fn()} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: '일정 삭제' }))
    expect(onDelete).toHaveBeenCalledWith('e1')
  })

  describe('month picker', () => {
    it('is closed by default and opens when the month label button is clicked', async () => {
      render(<ScheduleSection events={[]} year={2026} month0={6}
        onMonthChange={vi.fn()} onAdd={vi.fn()} onDelete={vi.fn()} />)
      expect(screen.queryByLabelText('월 선택 패널')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '월 선택' }))
      expect(screen.getByLabelText('월 선택 패널')).toBeInTheDocument()
    })

    it('navigates the picker year and selects a month', async () => {
      const onMonthChange = vi.fn()
      render(<ScheduleSection events={[]} year={2026} month0={6}
        onMonthChange={onMonthChange} onAdd={vi.fn()} onDelete={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: '월 선택' }))
      const panel = screen.getByLabelText('월 선택 패널')
      await userEvent.click(within(panel).getByRole('button', { name: '다음 해' }))
      await userEvent.click(within(panel).getByRole('button', { name: '3월' }))
      expect(onMonthChange).toHaveBeenCalledWith(2027, 2)
      expect(screen.queryByLabelText('월 선택 패널')).not.toBeInTheDocument()
    })
  })
})
