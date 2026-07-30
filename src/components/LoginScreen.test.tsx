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

  it('prevents duplicate sign-in clicks while authentication is pending', async () => {
    const onSignIn = vi.fn()
    render(<LoginScreen onSignIn={onSignIn} pending />)

    const button = screen.getByRole('button', { name: /연결 중/i })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('shows a dismissible authentication error', async () => {
    const onClearError = vi.fn()
    render(
      <LoginScreen
        onSignIn={vi.fn()}
        error="허용되지 않은 로그인 반환 주소입니다."
        onClearError={onClearError}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      '허용되지 않은 로그인 반환 주소입니다.',
    )
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClearError).toHaveBeenCalledOnce()
  })
})
