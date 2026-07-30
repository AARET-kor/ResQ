import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Profile } from '../lib/profile'

const planWorkstation = vi.fn()

vi.mock('../components/sections/PlanWorkstation', () => ({
  PlanWorkstation: (props: unknown) => {
    planWorkstation(props)
    return <section aria-label="통합 워크스테이션">워크스테이션</section>
  },
}))
vi.mock('../home/hooks/useTodos', () => ({
  useTodos: () => ({
    todos: [],
    loading: false,
    adding: false,
    pendingIds: new Set(),
    add: vi.fn(),
    toggle: vi.fn(),
    remove: vi.fn(),
  }),
}))
vi.mock('../home/hooks/useSchedule', () => ({
  useSchedule: () => ({
    events: [],
    loading: false,
    adding: false,
    deletingIds: new Set(),
    year: 2026,
    month0: 6,
    add: vi.fn(),
    remove: vi.fn(),
    changeMonth: vi.fn(),
  }),
}))
vi.mock('../home/hooks/useIntegrationSources', () => ({
  useIntegrationSources: () => ({ sources: [], loading: false }),
}))
vi.mock('../home/hooks/usePlannerCapture', () => ({
  usePlannerCapture: () => ({
    candidates: [],
    selectedIds: new Set(),
    candidateErrors: new Map(),
    extracting: false,
    savingIds: new Set(),
    savingSelected: false,
    extract: vi.fn(),
    updateCandidate: vi.fn(),
    setSelectedIds: vi.fn(),
    saveCandidate: vi.fn(),
    saveSelected: vi.fn(),
    dismissCandidate: vi.fn(),
    dismissAll: vi.fn(),
  }),
}))

import { PlanPage } from './PlanPage'

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

describe('PlanPage', () => {
  it('renders one unified workstation with AI capture and no legacy cards', () => {
    render(<PlanPage profile={profile} onProfileChange={vi.fn()} />)

    expect(screen.getAllByLabelText('통합 워크스테이션')).toHaveLength(1)
    expect(planWorkstation).toHaveBeenCalledWith(expect.objectContaining({
      plannerCapture: expect.objectContaining({
        candidates: [],
      }),
      onDeleteEvent: expect.any(Function),
      onDeleteTodo: expect.any(Function),
    }))
    expect(screen.queryByLabelText('할 일 카드')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('스케줄 카드')).not.toBeInTheDocument()
  })
})
