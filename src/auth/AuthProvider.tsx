import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Provider } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '../lib/supabase'
import { AuthContext } from './authContext'
import { isExpectedAuthCallback } from './oauthCallback'

const NATIVE_AUTH_CALLBACK = 'com.resq.medical://auth/callback'
const NATIVE_INTEGRATION_CALLBACK =
  'com.resq.medical://integration/callback'
const DESKTOP_AUTH_CALLBACK = 'resq://auth/callback'
const DESKTOP_INTEGRATION_CALLBACK = 'resq://integration/callback'
const GMAIL_SCOPE_GRANTED_KEY = 'resq.auth.gmail-scope-granted'
const GMAIL_SCOPE_PENDING_KEY = 'resq.auth.gmail-scope-pending'
const GMAIL_WEB_INTENT = 'gmail'
const EXTERNAL_AUTH_TIMEOUT_MS = 5 * 60 * 1000

function callbackParams(value: string): URLSearchParams {
  const callback = new URL(value)
  const params = new URLSearchParams(callback.search)
  const fragment = new URLSearchParams(callback.hash.replace(/^#/, ''))
  fragment.forEach((fragmentValue, key) => {
    if (!params.has(key)) params.set(key, fragmentValue)
  })
  return params
}

function authCallbackError(params: URLSearchParams): string | null {
  const description = params.get('error_description')
  if (description) return description
  if (params.get('error')) {
    return '계정 로그인을 완료하지 못했습니다. 다시 시도해주세요.'
  }
  return null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return '로그인을 시작하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.'
}

function providerTokenFromSession(session: Session | null): string | null {
  return ((session as unknown as { provider_token?: string })?.provider_token)
    ?? null
}

function setStoredFlag(key: string, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(key, 'true')
    else window.localStorage.removeItem(key)
  } catch {
    // OAuth still works when browser privacy settings disable local storage;
    // Gmail is treated as disconnected instead of assuming permission.
  }
}

function hasStoredFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function webRedirectForIntent(intent?: string): string {
  if (!intent) return window.location.origin
  const target = new URL(window.location.href)
  target.search = ''
  target.hash = ''
  target.searchParams.set('auth_intent', intent)
  return target.toString()
}

function clearWebAuthIntent(): void {
  const target = new URL(window.location.href)
  target.searchParams.delete('auth_intent')
  target.searchParams.delete('error')
  target.searchParams.delete('error_code')
  target.searchParams.delete('error_description')
  const fragment = new URLSearchParams(target.hash.replace(/^#/, ''))
  if (fragment.has('error') || fragment.has('error_description')) target.hash = ''
  window.history.replaceState(
    {},
    '',
    `${target.pathname}${target.search}${target.hash}`,
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [gmailScopeGranted, setGmailScopeGranted] = useState(
    () => hasStoredFlag(GMAIL_SCOPE_GRANTED_KEY),
  )
  const authInFlightRef = useRef(false)
  const authTimeoutRef = useRef<number | null>(null)

  const finishAuthRequest = useCallback(() => {
    if (authTimeoutRef.current !== null) {
      window.clearTimeout(authTimeoutRef.current)
      authTimeoutRef.current = null
    }
    authInFlightRef.current = false
    setAuthPending(false)
  }, [])

  const beginAuthRequest = useCallback((): boolean => {
    if (authInFlightRef.current) return false
    authInFlightRef.current = true
    setAuthPending(true)
    setAuthError(null)
    return true
  }, [])

  const updateGmailScopeGranted = useCallback((granted: boolean) => {
    setStoredFlag(GMAIL_SCOPE_GRANTED_KEY, granted)
    setGmailScopeGranted(granted)
  }, [])

  const finishGmailScopeIntent = useCallback((nextSession: Session | null) => {
    if (!hasStoredFlag(GMAIL_SCOPE_PENDING_KEY)) return
    setStoredFlag(GMAIL_SCOPE_PENDING_KEY, false)
    if (providerTokenFromSession(nextSession)) {
      updateGmailScopeGranted(true)
      return
    }
    updateGmailScopeGranted(false)
    setAuthError(
      'Google 로그인은 완료됐지만 Gmail 권한 토큰을 받지 못했습니다. Gmail 권한을 다시 연결해주세요.',
    )
  }, [updateGmailScopeGranted])

  const cancelGmailScopeIntent = useCallback(() => {
    if (!hasStoredFlag(GMAIL_SCOPE_PENDING_KEY)) return
    setStoredFlag(GMAIL_SCOPE_PENDING_KEY, false)
    updateGmailScopeGranted(false)
  }, [updateGmailScopeGranted])

  const waitForExternalAuthCallback = useCallback(() => {
    if (!authInFlightRef.current) return
    if (authTimeoutRef.current !== null) {
      window.clearTimeout(authTimeoutRef.current)
    }
    authTimeoutRef.current = window.setTimeout(() => {
      authTimeoutRef.current = null
      authInFlightRef.current = false
      setAuthPending(false)
      cancelGmailScopeIntent()
      setAuthError(
        '로그인 응답을 기다리는 시간이 초과됐습니다. 브라우저를 닫고 다시 시도해주세요.',
      )
    }, EXTERNAL_AUTH_TIMEOUT_MS)
  }, [cancelGmailScopeIntent])

  const exchangeAuthCode = useCallback(async (code: string) => {
    authInFlightRef.current = true
    setAuthPending(true)
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        cancelGmailScopeIntent()
        setAuthError(error.message)
      } else {
        if (data.session) setSession(data.session)
        setAuthError(null)
        finishGmailScopeIntent(data.session)
      }
    } catch (error) {
      cancelGmailScopeIntent()
      setAuthError(errorMessage(error))
    } finally {
      finishAuthRequest()
    }
  }, [cancelGmailScopeIntent, finishAuthRequest, finishGmailScopeIntent])

  useEffect(() => () => {
    if (authTimeoutRef.current !== null) {
      window.clearTimeout(authTimeoutRef.current)
      authTimeoutRef.current = null
    }
    authInFlightRef.current = false
  }, [])

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session)
        const current = new URL(window.location.href)
        const callbackError = authCallbackError(callbackParams(current.href))
        const gmailIntent =
          current.searchParams.get('auth_intent') === GMAIL_WEB_INTENT
        if (callbackError) {
          if (gmailIntent) {
            setStoredFlag(GMAIL_SCOPE_PENDING_KEY, false)
            updateGmailScopeGranted(false)
          }
          finishAuthRequest()
          setAuthError(callbackError)
          clearWebAuthIntent()
        } else if (gmailIntent) {
          finishGmailScopeIntent(data.session)
          finishAuthRequest()
          clearWebAuthIntent()
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'SIGNED_IN') finishGmailScopeIntent(next)
      if (event === 'SIGNED_OUT') {
        setStoredFlag(GMAIL_SCOPE_PENDING_KEY, false)
        updateGmailScopeGranted(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [
    finishAuthRequest,
    finishGmailScopeIntent,
    updateGmailScopeGranted,
  ])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let active = true
    let removeListener: (() => Promise<void>) | undefined
    App.addListener('appUrlOpen', async ({ url }) => {
      if (isExpectedAuthCallback(url, NATIVE_AUTH_CALLBACK)) {
        const params = callbackParams(url)
        const callbackError = authCallbackError(params)
        if (callbackError) {
          cancelGmailScopeIntent()
          finishAuthRequest()
          setAuthError(callbackError)
          await Browser.close()
          return
        }
        const code = params.get('code')
        if (code) {
          await exchangeAuthCode(code)
        } else {
          cancelGmailScopeIntent()
          finishAuthRequest()
          setAuthError('로그인 응답에 인증 코드가 없습니다. 다시 시도해주세요.')
        }
        await Browser.close()
        return
      }
      if (isExpectedAuthCallback(url, NATIVE_INTEGRATION_CALLBACK)) {
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
  }, [cancelGmailScopeIntent, exchangeAuthCode, finishAuthRequest])

  useEffect(() => {
    const desktop = window.resqDesktop
    if (!desktop?.isDesktop) return

    return desktop.onDeepLink((url) => {
      void (async () => {
        if (isExpectedAuthCallback(url, DESKTOP_AUTH_CALLBACK)) {
          const params = callbackParams(url)
          const callbackError = authCallbackError(params)
          if (callbackError) {
            cancelGmailScopeIntent()
            finishAuthRequest()
            setAuthError(callbackError)
            return
          }
          const code = params.get('code')
          if (!code) {
            cancelGmailScopeIntent()
            finishAuthRequest()
            setAuthError('로그인 응답에 인증 코드가 없습니다. 다시 시도해주세요.')
            return
          }
          await exchangeAuthCode(code)
          return
        }

        if (isExpectedAuthCallback(url, DESKTOP_INTEGRATION_CALLBACK)) {
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
  }, [cancelGmailScopeIntent, exchangeAuthCode, finishAuthRequest])

  const signInProvider = async (
    provider: Provider,
    scopes?: string,
    queryParams?: Record<string, string>,
    webIntent?: string,
  ) => {
    if (!beginAuthRequest()) return
    let waitingForCallback = false
    try {
      const native = Capacitor.isNativePlatform()
      const desktop = Boolean(window.resqDesktop?.isDesktop)
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: native
            ? NATIVE_AUTH_CALLBACK
            : desktop
              ? DESKTOP_AUTH_CALLBACK
              : webRedirectForIntent(webIntent),
          scopes,
          queryParams,
          skipBrowserRedirect: native || desktop,
        },
      })
      if (error) throw error
      if ((native || desktop) && !data.url) {
        throw new Error('로그인 주소를 만들지 못했습니다. 다시 시도해주세요.')
      }
      if (native && data.url) {
        waitingForCallback = true
        await Browser.open({ url: data.url })
        waitForExternalAuthCallback()
      } else if (desktop && data.url) {
        waitingForCallback = true
        await window.resqDesktop!.openExternal(data.url)
        waitForExternalAuthCallback()
      }
    } catch (error) {
      waitingForCallback = false
      setAuthError(errorMessage(error))
      throw error
    } finally {
      if (!waitingForCallback || !authInFlightRef.current) {
        finishAuthRequest()
      }
    }
  }

  const signIn = async () => {
    setStoredFlag(GMAIL_SCOPE_PENDING_KEY, false)
    updateGmailScopeGranted(false)
    await signInProvider('google')
  }
  const reconnectGoogle = async () => {
    setStoredFlag(GMAIL_SCOPE_PENDING_KEY, true)
    updateGmailScopeGranted(false)
    try {
      await signInProvider(
        'google',
        [
          'https://www.googleapis.com/auth/gmail.readonly',
        ].join(' '),
        { access_type: 'offline', prompt: 'consent' },
        GMAIL_WEB_INTENT,
      )
    } catch (error) {
      setStoredFlag(GMAIL_SCOPE_PENDING_KEY, false)
      throw error
    }
  }
  const signInWithApple = async () => {
    setStoredFlag(GMAIL_SCOPE_PENDING_KEY, false)
    updateGmailScopeGranted(false)
    await signInProvider('apple')
  }
  const signOut = async () => {
    setStoredFlag(GMAIL_SCOPE_PENDING_KEY, false)
    updateGmailScopeGranted(false)
    finishAuthRequest()
    await supabase.auth.signOut()
  }

  const sessionProvider = (
    session?.user?.app_metadata as { provider?: string } | undefined
  )?.provider
  const providerToken = gmailScopeGranted
    && (!sessionProvider || sessionProvider === 'google')
    ? providerTokenFromSession(session)
    : null
  const appleSignInAvailable = import.meta.env.VITE_APPLE_AUTH_ENABLED === 'true'

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      authPending,
      authError,
      signIn,
      reconnectGoogle,
      signInWithApple,
      appleSignInAvailable,
      signOut,
      clearAuthError: () => setAuthError(null),
      providerToken,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
