import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './Hero'
import type { Profile } from '../lib/profile'

const profile: Profile = {
  id: 'u1', hospital: 'A대학교병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 0, mascot_level: 1, mascot_stage: 1,
}

describe('Hero', () => {
  it('shows the nav, the user greeting and a D-day figure', () => {
    render(<Hero profile={profile} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText('ResQ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /논문/ })).toBeInTheDocument()
    expect(screen.getByText(/길동/)).toBeInTheDocument()
    expect(screen.getByText(/내과/)).toBeInTheDocument()
    expect(screen.getByText('D-10')).toBeInTheDocument()
  })
})
