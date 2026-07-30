import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsModal } from './SettingsModal'
import type { Profile } from '../lib/profile'

const profile: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '성형외과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 0, mascot_level: 1, mascot_stage: 1, interests: '피부과',
}

describe('SettingsModal', () => {
  it('shows current specialty and interests, saves changes', async () => {
    const onSave = vi.fn()
    render(<SettingsModal profile={profile} onSave={onSave} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect((within(dialog).getByLabelText('전공') as HTMLSelectElement).value).toBe('성형외과')
    expect(within(dialog).getByRole('checkbox', { name: '피부과' })).toBeChecked()
    await userEvent.selectOptions(within(dialog).getByLabelText('전공'), '피부과')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: '내과' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    expect(onSave).toHaveBeenCalledWith({ specialty: '피부과', interests: '피부과,내과' })
  })
  it('closes without saving', async () => {
    const onClose = vi.fn(); const onSave = vi.fn()
    render(<SettingsModal profile={profile} onSave={onSave} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
