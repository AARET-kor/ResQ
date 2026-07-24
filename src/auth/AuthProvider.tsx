import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Provider } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '../lib/supabase'

const NATIVE_AUTH_CALLBACK = 'com.resq.medical://auth/callback'

interface AuthState {
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

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let active = true
    let removeListener: (() => Promise<void>) | undefined
    App.addListener('appUrlOpen', async ({ url }) => {
      if (url.startsWith(NATIVE_AUTH_CALLBACK)) {
        const callback = new URL(url)
        const code = callback.searchParams.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) console.error(error)
        }
        await Browser.close()
        return
      }
      if (url.startsWith('com.resq.medical://integration/callback')) {
        const callback = new URL(url)
        const target = new URL(window.location.href)
        target.searchParams.set(
          'integration',
          callback.searchParams.get('integration') ?? 'microsoft-error',
        )
        const reason = callback.searchParams.get('reason')
        if (reason) target.searchParams.set('reason', reason)
        await Browser.close()
        window.location.replace(target.toString())
      }
    }).then((handle) => {
      if (!active) {
        void handle.remove()
        return
      }
      removeListener = () => handle.remove()
    })
    return () => {
      active = false
      if (removeListener) void removeListener()
    }
  }, [])

  const signInProvider = async (
    provider: Provider,
    scopes?: string,
    queryParams?: Record<string, string>,
  ) => {
    const native = Capacitor.isNativePlatform()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: native ? NATIVE_AUTH_CALLBACK : window.location.origin,
        scopes,
        queryParams,
        skipBrowserRedirect: native,
      },
    })
    if (error) throw error
    if (native && data.url) await Browser.open({ url: data.url })
  }

  const signIn = async () => {
    await signInProvider(
      'google',
      [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/gmail.readonly',
      ].join(' '),
      { access_type: 'offline', prompt: 'consent' },
    )
  }
  const signInWithApple = async () => signInProvider('apple')
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const providerToken = ((session as unknown as { provider_token?: string })?.provider_token) ?? null
  const appleSignInAvailable = import.meta.env.VITE_APPLE_AUTH_ENABLED === 'true'

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      signIn,
      reconnectGoogle: signIn,
      signInWithApple,
      appleSignInAvailable,
      signOut,
      providerToken,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
