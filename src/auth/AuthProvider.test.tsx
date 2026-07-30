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
import { isExpectedAuthCallback } from './oauthCallback'

function Probe() {
  const {
    authError,
    authPending,
    loading,
    reconnectGoogle,
    providerToken,
    session,
    signIn,
    signInWithApple,
  } = useAuth()
  return (
    <>
      <div>{loading ? 'loading' : session ? 'in' : 'out'}</div>
      <div>{authPending ? 'auth-pending' : 'auth-idle'}</div>
      <div>{providerToken ?? 'no-gmail-token'}</div>
      {authError && <div role="alert">{authError}</div>}
      <button type="button" onClick={() => void signIn()}>로그인</button>
      <button type="button" onClick={() => void reconnectGoogle()}>
        Gmail 다시 연결
      </button>
      <button type="button" onClick={() => void signInWithApple()}>
        Apple 로그인
      </button>
    </>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const storedValues = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
        removeItem: (key: string) => storedValues.delete(key),
        clear: () => storedValues.clear(),
      },
    })
    window.history.replaceState({}, '', '/')
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
    expect(signInWithOAuth.mock.calls[0][0].options.scopes).toBeUndefined()
    expect(openExternal).toHaveBeenCalledWith(
      'https://accounts.google.com/oauth',
    )
  })

  it('keeps desktop OAuth single-flight until the deep-link callback finishes', async () => {
    let receiveDeepLink: ((url: string) => void) | undefined
    const openExternal = vi.fn().mockResolvedValue(undefined)
    window.resqDesktop = {
      isDesktop: true,
      openExternal,
      onDeepLink: vi.fn((callback) => {
        receiveDeepLink = callback
        return vi.fn()
      }),
    }
    getSession.mockResolvedValue({ data: { session: null } })
    signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/oauth' },
      error: null,
    })
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })

    render(<AuthProvider><Probe /></AuthProvider>)
    const signInButton = await screen.findByRole('button', { name: '로그인' })
    await userEvent.click(signInButton)

    expect(await screen.findByText('auth-pending')).toBeInTheDocument()
    await userEvent.click(signInButton)
    expect(signInWithOAuth).toHaveBeenCalledOnce()

    receiveDeepLink?.('resq://auth/callback?code=desktop-code')
    expect(await screen.findByText('auth-idle')).toBeInTheDocument()
    expect(exchangeCodeForSession).toHaveBeenCalledWith('desktop-code')
  })

  it('rejects credentialed and port-bearing native callback lookalikes', () => {
    const expected = 'com.resq.medical://auth/callback'

    expect(isExpectedAuthCallback(expected, expected)).toBe(true)
    expect(isExpectedAuthCallback(
      'com.resq.medical://user@auth/callback?code=stolen',
      expected,
    )).toBe(false)
    expect(isExpectedAuthCallback(
      'com.resq.medical://auth:443/callback?code=stolen',
      expected,
    )).toBe(false)
  })

  it('requests the restricted Gmail scope only during explicit reconnect', async () => {
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
    await userEvent.click(
      await screen.findByRole('button', { name: 'Gmail 다시 연결' }),
    )

    expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      }),
    }))
  })

  it('does not treat a basic Google provider token as Gmail permission', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          provider_token: 'basic-google-token',
          user: { id: 'u1' },
        },
      },
    })

    render(<AuthProvider><Probe /></AuthProvider>)

    expect(await screen.findByText('no-gmail-token')).toBeInTheDocument()
  })

  it('surfaces a web OAuth callback error and clears it from the URL', async () => {
    window.history.replaceState(
      {},
      '',
      '/?error=access_denied&error_description=Google+access+denied',
    )
    getSession.mockResolvedValue({ data: { session: null } })

    render(<AuthProvider><Probe /></AuthProvider>)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google access denied',
    )
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('never exposes an Apple provider token as a Gmail token', async () => {
    window.localStorage.setItem('resq.auth.gmail-scope-granted', 'true')
    getSession.mockResolvedValue({
      data: {
        session: {
          provider_token: 'apple-provider-token',
          user: { id: 'u1', app_metadata: { provider: 'apple' } },
        },
      },
    })

    render(<AuthProvider><Probe /></AuthProvider>)

    expect(await screen.findByText('no-gmail-token')).toBeInTheDocument()
  })

  it('exposes the provider token after a successful explicit Gmail reconnect', async () => {
    let receiveDeepLink: ((url: string) => void) | undefined
    window.resqDesktop = {
      isDesktop: true,
      openExternal: vi.fn().mockResolvedValue(undefined),
      onDeepLink: vi.fn((callback) => {
        receiveDeepLink = callback
        return vi.fn()
      }),
    }
    getSession.mockResolvedValue({ data: { session: null } })
    signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/oauth' },
      error: null,
    })
    exchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          provider_token: 'gmail-provider-token',
          user: { id: 'u1' },
        },
      },
      error: null,
    })

    render(<AuthProvider><Probe /></AuthProvider>)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Gmail 다시 연결' }),
    )
    receiveDeepLink?.('resq://auth/callback?code=gmail-code')

    expect(await screen.findByText('gmail-provider-token')).toBeInTheDocument()
    expect(
      window.localStorage.getItem('resq.auth.gmail-scope-granted'),
    ).toBe('true')
    expect(
      window.localStorage.getItem('resq.auth.gmail-scope-pending'),
    ).toBeNull()
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

  it('surfaces an OAuth callback error received through a desktop deep link', async () => {
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

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(receiveDeepLink).toBeTypeOf('function'))
    receiveDeepLink?.(
      'resq://auth/callback?error=access_denied&error_description=Login+cancelled',
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Login cancelled')
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('ignores a lookalike desktop callback URL', async () => {
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

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(receiveDeepLink).toBeTypeOf('function'))
    receiveDeepLink?.('resq://auth/callback-elsewhere?code=not-for-resq')

    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('surfaces a desktop session exchange failure', async () => {
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
    exchangeCodeForSession.mockResolvedValue({
      error: new Error('PKCE verifier mismatch'),
    })

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(receiveDeepLink).toBeTypeOf('function'))
    receiveDeepLink?.('resq://auth/callback?code=expired-code')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PKCE verifier mismatch',
    )
    await waitFor(() => expect(screen.getByText('auth-idle')).toBeInTheDocument())
  })
})
