import { describe, it, expect } from 'vitest'
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
const mascot = deriveMascotState(profile, '2028-02-18')

describe('Hero (mascot stage)', () => {
  it('keeps nav, greeting and D-day', () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText('ResQ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /논문/ })).toBeInTheDocument()
    expect(screen.getByText(/길동/)).toBeInTheDocument()
    expect(screen.getByText('D-10')).toBeInTheDocument()
  })
  it('renders the mascot with variant and stat bar', () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText(/큐비/)).toBeInTheDocument()
    expect(screen.getByText(/Lv\.\s*2/)).toBeInTheDocument()
    // ghost background label also renders speciesLabel alone (aria-hidden), so
    // assert the stat bar's combined "variant species" text to disambiguate.
    expect(
      screen.getByText(new RegExp(`${mascot.variantLabel}\\s+${mascot.speciesLabel}`)),
    ).toBeInTheDocument()
  })
  it('previews other stages without changing the actual stage', async () => {
    render(<Hero profile={profile} mascot={mascot} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    // actual stage text still shown in stat bar (mascot.stage = CHIEF at 2028-02-18)
    expect(screen.getByText(new RegExp(`현재`))).toBeInTheDocument()
  })
  it('renders without a stat bar when mascot is null', () => {
    render(<Hero profile={profile} mascot={null} onSignOut={() => {}} now={new Date('2028-02-18')} />)
    expect(screen.getByText(/길동/)).toBeInTheDocument()
    expect(screen.queryByText(/큐비/)).not.toBeInTheDocument()
  })
})
