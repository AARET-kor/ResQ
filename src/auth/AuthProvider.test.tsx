import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession, onAuthStateChange, signInWithOAuth: vi.fn(), signOut: vi.fn() } },
}))

import { AuthProvider, useAuth } from './AuthProvider'

function Probe() {
  const { loading, session } = useAuth()
  return <div>{loading ? 'loading' : session ? 'in' : 'out'}</div>
}

describe('AuthProvider', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
