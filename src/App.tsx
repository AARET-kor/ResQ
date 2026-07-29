import { lazy, Suspense, useEffect, useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import { getProfile, upsertProfile, isProfileComplete, type Profile } from './lib/profile'
import { LoginScreen } from './components/LoginScreen'
import { Onboarding, type OnboardingValues } from './components/Onboarding'
import { Hero } from './components/Hero'
import { SettingsModal } from './components/SettingsModal'
import { TextureOverlay } from './components/TextureOverlay'
import { AppHeader } from './components/AppHeader'
import { useMascot } from './mascot/useMascot'
import { useAppRoute } from './app/routes'
import { HomePage } from './pages/HomePage'

const PlanPage = lazy(() => import('./pages/PlanPage').then(({ PlanPage: page }) => ({ default: page })))
const TeamPage = lazy(() => import('./pages/TeamPage').then(({ TeamPage: page }) => ({ default: page })))
const PapersPage = lazy(() => import('./pages/PapersPage').then(({ PapersPage: page }) => ({ default: page })))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage').then(({ IntegrationsPage: page }) => ({ default: page })))

function PageLoading() {
  return (
    <div
      className="flex min-h-[55vh] items-center justify-center font-sans text-sm uppercase tracking-[0.24em] text-muted"
      role="status"
    >
      workspace loading…
    </div>
  )
}

export default function App() {
  const {
    session,
    loading,
    signIn,
    signInWithApple,
    appleSignInAvailable,
    signOut,
  } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  // profileLoaded distinguishes "not fetched yet" from "fetched, no row" — the
  // gate below treats an authenticated-but-unfetched user as loading, so a
  // returning user never flashes the onboarding form before their profile lands.
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [onboardError, setOnboardError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const route = useAppRoute()

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setProfileLoaded(true)
      return
    }
    // active guard: if the user changes (sign out → other sign in) before this
    // fetch resolves, discard the stale result instead of showing another user's data.
    let active = true
    setProfileLoaded(false)
    getProfile(supabase, userId)
      .then((p) => { if (active) setProfile(p) })
      .catch((e) => { if (active) { console.error(e); setProfile(null) } })
      .finally(() => { if (active) setProfileLoaded(true) })
    return () => { active = false }
  }, [userId])

  const handleOnboard = async (v: OnboardingValues) => {
    if (!userId) return
    try {
      const saved = await upsertProfile(supabase, { id: userId, ...v })
      setProfile(saved)
      setOnboardError(null)
    } catch (e) {
      console.error(e)
      setOnboardError('프로필 저장에 실패했습니다. 다시 시도해주세요.')
    }
  }

  const mascot = useMascot(profile, setProfile)

  if (loading || (userId && !profileLoaded)) {
    return <div className="flex min-h-screen items-center justify-center font-sans text-sm uppercase text-muted">loading…</div>
  }
  if (!session) return (
    <>
      <TextureOverlay />
      <LoginScreen
        onSignIn={signIn}
        onAppleSignIn={signInWithApple}
        appleSignInAvailable={appleSignInAvailable}
      />
    </>
  )
  if (!isProfileComplete(profile)) return (<><TextureOverlay /><Onboarding onSubmit={handleOnboard} error={onboardError} /></>)
  const activeProfile = profile!
  const page = route === 'plan'
    ? <PlanPage profile={activeProfile} onProfileChange={setProfile} />
    : route === 'team'
      ? <TeamPage profile={activeProfile} />
      : route === 'papers'
        ? <PapersPage profile={activeProfile} onProfileChange={setProfile} />
        : route === 'integrations'
          ? <IntegrationsPage profile={activeProfile} onProfileChange={setProfile} />
          : null
  return (
    <>
      {route === 'home' && <TextureOverlay />}
      {route === 'home' ? (
        <>
          <Hero
            profile={activeProfile}
            mascot={mascot}
            onSignOut={signOut}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <HomePage profile={activeProfile} onProfileChange={setProfile} />
        </>
      ) : (
        <>
          <AppHeader
            route={route}
            profile={activeProfile}
            onSignOut={signOut}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <main>
            <Suspense fallback={<PageLoading />}>
              {page}
            </Suspense>
          </main>
        </>
      )}
      {settingsOpen && (
        <SettingsModal
          profile={activeProfile}
          onClose={() => setSettingsOpen(false)}
          onSave={async (v) => {
            try {
              const saved = await upsertProfile(supabase, { id: activeProfile.id, ...v })
              setProfile(saved)
              setSettingsOpen(false)
            } catch (e) {
              // interests column may not exist yet (migration 0008) — at least
              // persist the primary specialty change instead of losing both.
              console.error(e)
              try {
                const saved = await upsertProfile(supabase, { id: activeProfile.id, specialty: v.specialty })
                setProfile(saved)
                setSettingsOpen(false)
              } catch (e2) { console.error(e2) }
            }
          }}
        />
      )}
    </>
  )
}
