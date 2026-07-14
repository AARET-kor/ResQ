import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const useAuth = vi.fn()
vi.mock('./auth/AuthProvider', () => ({ useAuth: () => useAuth() }))

const getProfile = vi.fn()
const upsertProfile = vi.fn()
vi.mock('./lib/profile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/profile')>()
  return {
    ...actual,
    getProfile: (...a: unknown[]) => getProfile(...a),
    upsertProfile: (...a: unknown[]) => upsertProfile(...a),
  }
})

vi.mock('./lib/supabase', () => ({ supabase: {} }))

import App from './App'
import type { Profile } from './lib/profile'

const fullProfile: Profile = {
  id: 'u1', hospital: 'A병원', specialty: '내과', pgy: 2, nickname: '길동',
  training_start: '2024-03-01', training_end: '2028-02-28',
  xp: 0, mascot_level: 1, mascot_stage: 1,
}

function authed() {
  useAuth.mockReturnValue({
    session: { user: { id: 'u1' } }, loading: false, signIn: vi.fn(), signOut: vi.fn(),
  })
}

describe('App gating', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the login screen when there is no session', () => {
    useAuth.mockReturnValue({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() })
    render(<App />)
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })

  it('shows loading — NOT onboarding — while a signed-in user profile is still fetching', () => {
    authed()
    getProfile.mockReturnValue(new Promise(() => {})) // never resolves
    render(<App />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText(/Welcome to ResQ/i)).not.toBeInTheDocument()
  })

  it('shows onboarding when signed in with no profile row yet', async () => {
    authed()
    getProfile.mockResolvedValue(null)
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Welcome to ResQ/i)).toBeInTheDocument())
  })

  it('shows the hero dashboard when signed in with a complete profile', async () => {
    authed()
    getProfile.mockResolvedValue(fullProfile)
    render(<App />)
    await waitFor(() => expect(screen.getByText(/길동/)).toBeInTheDocument())
  })
})
