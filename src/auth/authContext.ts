import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export interface AuthState {
  session: Session | null
  loading: boolean
  signIn: () => Promise<void>
  reconnectGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  appleSignInAvailable: boolean
  signOut: () => Promise<void>
  /** Google OAuth access token from the current session (null when absent/expired). */
  providerToken: string | null
}

export const AuthContext = createContext<AuthState | undefined>(undefined)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
