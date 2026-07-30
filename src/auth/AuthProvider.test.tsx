import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const {
  exchangeCodeForSession,
  getSession,
  onAuthStateChange,
  signInWithOAuth,
} = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInWithOAuth: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession,
      getSession,
      onAuthStateChange,
      signInWithOAuth,
      signOut: vi.fn(),
    },
  },
}))

import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'

function Probe() {
  const { loading, session, signIn } = useAuth()
  return (
    <>
      <div>{loading ? 'loading' : session ? 'in' : 'out'}</div>
      <button type="button" onClick={() => void signIn()}>로그인</button>
    </>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete window.resqDesktop
  })

  it('resolves to signed-out when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument())
  })

  it('resolves to signed-in when a session exists', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('in')).toBeInTheDocument())
  })

  it('opens OAuth in the system browser when running in the desktop app', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    window.resqDesktop = {
      isDesktop: true,
      openExternal,
      onDeepLink: vi.fn(() => vi.fn()),
    }
    getSession.mockResolvedValue({ data: { session: null } })
    signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/oauth' },
      error: null,
    })

    render(<AuthProvider><Probe /></AuthProvider>)
    await userEvent.click(await screen.findByRole('button', { name: '로그인' }))

    expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        redirectTo: 'resq://auth/callback',
        skipBrowserRedirect: true,
      }),
    }))
    expect(openExternal).toHaveBeenCalledWith(
      'https://accounts.google.com/oauth',
    )
  })

  it('exchanges a desktop auth deep link for a Supabase session', async () => {
    let receiveDeepLink: ((url: string) => void) | undefined
    window.resqDesktop = {
      isDesktop: true,
      openExternal: vi.fn(),
      onDeepLink: vi.fn((callback) => {
        receiveDeepLink = callback
        return vi.fn()
      }),
    }
    getSession.mockResolvedValue({ data: { session: null } })
    exchangeCodeForSession.mockResolvedValue({ error: null })

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(receiveDeepLink).toBeTypeOf('function'))
    receiveDeepLink?.('resq://auth/callback?code=desktop-code')

    await waitFor(() => {
      expect(exchangeCodeForSession).toHaveBeenCalledWith('desktop-code')
    })
  })
})
