import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from './LoginScreen'

describe('LoginScreen', () => {
  it('calls onSignIn when the Google button is clicked', async () => {
    const onSignIn = vi.fn()
    render(<LoginScreen onSignIn={onSignIn} />)
    await userEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(onSignIn).toHaveBeenCalledOnce()
  })
})
