import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Hero } from './Hero'
import { deriveMascotState } from '../mascot/state'
import type { Profile } from '../lib/profile'

const profile: Profile = {
  id: 'u1', hospital: 'A대학교병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 150, mascot_level: 1, mascot_stage: 1,
  mascot_species: null, mascot_name: null, last_active_on: '2028-02-18', streak_days: 3,
}
// At 2028-02-18 training is ~99% done → stage CHIEF, mood ENERGIZED, level 2.
const mascot = deriveMascotState(profile, '2028-02-18')

describe('Hero (figurine carousel)', () => {
  it('keeps nav, greeting and D-day', () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText('ResQ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /논문/ })).toBeInTheDocument()
    expect(screen.getByText(/길동/)).toBeInTheDocument()
    expect(screen.getByText('D-10')).toBeInTheDocument()
  })

  it('renders all four stage figurines with the current stage centered', () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(4)
    for (const img of imgs) {
      expect(img).toHaveAttribute('src', expect.stringMatching(/^https:\/\//))
    }
    expect(screen.getByText('치프 스테이지')).toBeInTheDocument() // active = actual stage
  })

  it('renders the stat bar with variant, level and streak', () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText(/큐비/)).toBeInTheDocument()
    expect(screen.getByText(/Lv\.\s*2/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${mascot.variantLabel} ${mascot.speciesLabel}`))).toBeInTheDocument()
    expect(screen.getByText('현재 치프')).toBeInTheDocument()
    expect(screen.getByText(/3일 연속/)).toBeInTheDocument()
  })

  it('rotates the carousel with the arrows without changing the actual stage', async () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    await userEvent.click(screen.getByRole('button', { name: '다음 단계' }))
    expect(screen.getByText('인턴 스테이지')).toBeInTheDocument() // CHIEF → wraps to INTERN
    expect(screen.getByText('현재 치프')).toBeInTheDocument()     // actual stage unchanged
  })

  it('renders without carousel or stat bar when mascot is null', () => {
    render(<Hero profile={profile} mascot={null} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText(/길동/)).toBeInTheDocument()
    expect(screen.queryByText(/큐비/)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('opens settings from the nav', async () => {
    const onOpenSettings = vi.fn()
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} onOpenSettings={onOpenSettings} now={new Date('2028-02-18')} />)
    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(onOpenSettings).toHaveBeenCalled()
  })
})
