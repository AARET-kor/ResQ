import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MascotZone } from './MascotZone'
import type { MascotState } from '../mascot/state'

const state: MascotState = {
  speciesId: 'frog', speciesLabel: '개구리', tint: '#22c55e', name: '큐비',
  stage: 'SENIOR', mood: 'ENERGIZED', level: 2, xpInLevel: 50, xpForLevel: 200, streakDays: 3,
}

describe('MascotZone', () => {
  it('shows the mascot name, level, current stage and mood', () => {
    render(<MascotZone state={state} />)
    expect(screen.getByText(/큐비/)).toBeInTheDocument()
    expect(screen.getByText(/Lv\.\s*2/)).toBeInTheDocument()
    expect(screen.getByText('시니어 단계')).toBeInTheDocument()
    expect(screen.getByText('현재 시니어')).toBeInTheDocument()
    expect(screen.getByText(/쌩쌩/)).toBeInTheDocument()
  })
  it('previews other evolution stages with the arrows', async () => {
    render(<MascotZone state={state} />)
    await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    expect(screen.getByText('치프 단계')).toBeInTheDocument()
    // the actual stage indicator does not change
    expect(screen.getByText('현재 시니어')).toBeInTheDocument()
  })
})
