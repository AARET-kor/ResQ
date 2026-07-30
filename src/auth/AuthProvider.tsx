import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Provider } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '../lib/supabase'
import { AuthContext } from './authContext'

const NATIVE_AUTH_CALLBACK = 'com.resq.medical://auth/callback'
const NATIVE_INTEGRATION_CALLBACK =
  'com.resq.medical://integration/callback'
const DESKTOP_AUTH_CALLBACK = 'resq://auth/callback'
const DESKTOP_INTEGRATION_CALLBACK = 'resq://integration/callback'

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
      if (url.startsWith(NATIVE_INTEGRATION_CALLBACK)) {
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

  useEffect(() => {
    const desktop = window.resqDesktop
    if (!desktop?.isDesktop) return

    return desktop.onDeepLink((url) => {
      void (async () => {
        if (url.startsWith(DESKTOP_AUTH_CALLBACK)) {
          const code = new URL(url).searchParams.get('code')
          if (!code) return
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) console.error(error)
          return
        }

        if (url.startsWith(DESKTOP_INTEGRATION_CALLBACK)) {
          const callback = new URL(url)
          const target = new URL(window.location.href)
          target.searchParams.set(
            'integration',
            callback.searchParams.get('integration') ?? 'integration-error',
          )
          const reason = callback.searchParams.get('reason')
          if (reason) target.searchParams.set('reason', reason)
          window.location.replace(target.toString())
        }
      })()
    })
  }, [])

  const signInProvider = async (
    provider: Provider,
    scopes?: string,
    queryParams?: Record<string, string>,
  ) => {
    const native = Capacitor.isNativePlatform()
    const desktop = Boolean(window.resqDesktop?.isDesktop)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: native
          ? NATIVE_AUTH_CALLBACK
          : desktop
            ? DESKTOP_AUTH_CALLBACK
            : window.location.origin,
        scopes,
        queryParams,
        skipBrowserRedirect: native || desktop,
      },
    })
    if (error) throw error
    if (native && data.url) await Browser.open({ url: data.url })
    else if (desktop && data.url) {
      await window.resqDesktop!.openExternal(data.url)
    }
  }

  const signIn = async () => {
    await signInProvider(
      'google',
      [
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
