import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamSection } from './TeamSection'
import type { Team, TeamMember, TeamTask } from '../../lib/team'
import type { EventItem } from '../../lib/events'

const team: Team = { id: 'tm1', name: '내과 의국', code: 'ABC123', created_by: 'u1' }
const tasks: TeamTask[] = [
  { id: 'a', team_id: 'tm1', title: '저널 발제 준비', status: 'todo', assignee: '길동', due_date: null, created_by: 'u1' },
  { id: 'b', team_id: 'tm1', title: '케이스 정리', status: 'doing', assignee: null, due_date: null, created_by: 'u1' },
  { id: 'c', team_id: 'tm1', title: '당직표 공유', status: 'done', assignee: null, due_date: null, created_by: 'u1' },
]
const conferences: EventItem[] = [
  { id: 'e1', user_id: 'u1', title: '대한내과학회 추계', starts_at: '2026-07-25T09:00:00+09:00', ends_at: null, kind: 'conference', location: null, notes: null },
]
const members: TeamMember[] = [
  { team_id: 'tm1', user_id: 'u1', role: 'owner', nickname: '길동' },
  { team_id: 'tm1', user_id: 'u2', role: 'professor', nickname: '교수님' },
]

describe('TeamSection — no team', () => {
  it('offers create and join', async () => {
    const onCreate = vi.fn()
    const onJoin = vi.fn()
    render(<TeamSection team={null} tasks={[]} conferences={[]}
      onCreate={onCreate} onJoin={onJoin} onAddTask={vi.fn()} onMove={vi.fn()} onDeleteTask={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('팀 이름'), '내과 의국')
    await userEvent.click(screen.getByRole('button', { name: '팀 만들기' }))
    expect(onCreate).toHaveBeenCalledWith('내과 의국')
    await userEvent.type(screen.getByLabelText('초대 코드'), 'abc123')
    await userEvent.click(screen.getByRole('button', { name: '참여하기' }))
    expect(onJoin).toHaveBeenCalledWith('abc123')
  })
})

describe('TeamSection — with team', () => {
  const renderBoard = (over = {}) => {
    const props = {
      team, tasks, conferences,
      onCreate: vi.fn(), onJoin: vi.fn(),
      onAddTask: vi.fn(), onMove: vi.fn(), onDeleteTask: vi.fn(),
      ...over,
    }
    render(<TeamSection {...props} />)
    return props
  }

  it('shows name, invite code, progress and three columns', () => {
    renderBoard()
    expect(screen.getByText('내과 의국')).toBeInTheDocument()
    expect(screen.getByText(/ABC123/)).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument() // 1 of 3 done
    const todoCol = screen.getByTestId('col-todo')
    expect(within(todoCol).getByText('저널 발제 준비')).toBeInTheDocument()
    expect(within(screen.getByTestId('col-doing')).getByText('케이스 정리')).toBeInTheDocument()
    expect(within(screen.getByTestId('col-done')).getByText('당직표 공유')).toBeInTheDocument()
  })
  it('adds a task', async () => {
    const p = renderBoard()
    await userEvent.type(screen.getByLabelText('팀 할일 추가'), '초록 마감 확인')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(p.onAddTask).toHaveBeenCalledWith('초록 마감 확인')
  })
  it('moves a task forward and back', async () => {
    const p = renderBoard()
    const todoCard = within(screen.getByTestId('col-todo')).getByText('저널 발제 준비').closest('li')!
    await userEvent.click(within(todoCard).getByRole('button', { name: '다음 상태' }))
    expect(p.onMove).toHaveBeenCalledWith(tasks[0], 'doing')
    const doingCard = within(screen.getByTestId('col-doing')).getByText('케이스 정리').closest('li')!
    await userEvent.click(within(doingCard).getByRole('button', { name: '이전 상태' }))
    expect(p.onMove).toHaveBeenCalledWith(tasks[1], 'todo')
  })
  it('lists this month conferences', () => {
    renderBoard()
    expect(screen.getByText('대한내과학회 추계')).toBeInTheDocument()
  })
  it('lets only the owner change roles and transfer ownership', async () => {
    const onChangeMemberRole = vi.fn()
    const onTransferOwnership = vi.fn()
    renderBoard({
      team: { ...team, current_role: 'owner' },
      currentUserId: 'u1',
      members,
      onChangeMemberRole,
      onTransferOwnership,
    })
    await userEvent.selectOptions(screen.getByLabelText('교수님 역할'), 'admin')
    expect(onChangeMemberRole).toHaveBeenCalledWith(members[1], 'admin')
    await userEvent.click(screen.getByRole('button', { name: '소유권 이전' }))
    expect(onTransferOwnership).toHaveBeenCalledWith(members[1])
  })
  it('hides task deletion from a member who did not create the task', () => {
    renderBoard({
      team: { ...team, current_role: 'member' },
      currentUserId: 'u2',
      members: members.map((member) => (
        member.user_id === 'u2' ? { ...member, role: 'member' as const } : member
      )),
    })
    expect(screen.queryByRole('button', { name: '팀 할일 삭제' })).not.toBeInTheDocument()
  })
})
