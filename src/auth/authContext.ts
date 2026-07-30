import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export interface AuthState {
  session: Session | null
  loading: boolean
  authPending: boolean
  authError: string | null
  signIn: () => Promise<void>
  reconnectGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  appleSignInAvailable: boolean
  signOut: () => Promise<void>
  clearAuthError: () => void
  /** Explicitly consented Gmail OAuth token (null for basic Google sign-in). */
  providerToken: string | null
}

export const AuthContext = createContext<AuthState | undefined>(undefined)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
