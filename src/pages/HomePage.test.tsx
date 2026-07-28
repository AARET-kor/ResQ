import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import type { Profile } from '../lib/profile'

vi.mock('../home/hooks/useTodos', () => ({
  useTodos: () => ({
    todos: [
      {
        id: 't1',
        title: '초진 기록 정리',
        done: false,
        due_date: null,
        due_time: null,
        priority: 'normal',
      },
    ],
    loading: false,
  }),
}))
vi.mock('../home/hooks/useSchedule', () => ({
  useSchedule: () => ({ events: [], loading: false }),
}))
vi.mock('../home/hooks/useTeam', () => ({
  useTeam: () => ({
    team: { name: 'A팀' },
    tasks: [{ id: 'tt1', status: 'doing' }],
    loading: false,
  }),
}))
vi.mock('../home/hooks/useIntegrationSources', () => ({
  useIntegrationSources: () => ({ sources: [], loading: false }),
}))

const profile: Profile = {
  id: 'u1',
  hospital: 'A병원',
  specialty: '내과',
  pgy: 2,
  nickname: '길동',
  training_start: '2024-03-01',
  training_end: '2028-02-28',
  xp: 0,
  mascot_level: 1,
  mascot_stage: 1,
}

describe('HomePage', () => {
  it('keeps the long-form overview while linking to focused pages', () => {
    render(<HomePage profile={profile} onProfileChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '오늘의 브리핑' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /기능마다/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /논문 워크스페이스/ })).toHaveAttribute('href', '/papers')
    expect(screen.getByRole('link', { name: /연동 관리/ })).toHaveAttribute('href', '/integrations')
  })
})
