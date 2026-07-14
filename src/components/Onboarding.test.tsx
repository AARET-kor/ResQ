import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Onboarding } from './Onboarding'

describe('Onboarding', () => {
  it('submits the entered profile fields', async () => {
    const onSubmit = vi.fn()
    render(<Onboarding onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('병원'), 'A대학교병원')
    await userEvent.type(screen.getByLabelText('전공'), '내과')
    await userEvent.type(screen.getByLabelText('연차'), '2')
    await userEvent.type(screen.getByLabelText('닉네임'), '길동')
    await userEvent.type(screen.getByLabelText('수련 시작일'), '2024-03-01')
    await userEvent.type(screen.getByLabelText('수련 종료일'), '2028-02-28')
    await userEvent.click(screen.getByRole('button', { name: /시작/ }))

    expect(onSubmit).toHaveBeenCalledWith({
      hospital: 'A대학교병원',
      specialty: '내과',
      pgy: 2,
      nickname: '길동',
      training_start: '2024-03-01',
      training_end: '2028-02-28',
    })
  })

  it('does not submit when a required field is empty', async () => {
    const onSubmit = vi.fn()
    render(<Onboarding onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: /시작/ }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
