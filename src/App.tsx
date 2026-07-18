import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import { getProfile, upsertProfile, isProfileComplete, type Profile } from './lib/profile'
import { LoginScreen } from './components/LoginScreen'
import { Onboarding, type OnboardingValues } from './components/Onboarding'
import { Hero } from './components/Hero'
import { SettingsModal } from './components/SettingsModal'
import { TextureOverlay } from './components/TextureOverlay'
import { useMascot } from './mascot/useMascot'
import { HomeSections } from './home/HomeSections'

export default function App() {
  const { session, loading, signIn, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  // profileLoaded distinguishes "not fetched yet" from "fetched, no row" — the
  // gate below treats an authenticated-but-unfetched user as loading, so a
  // returning user never flashes the onboarding form before their profile lands.
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [onboardError, setOnboardError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
    return <div className="flex min-h-screen items-center justify-center font-mono text-sm uppercase text-cream/60">loading…</div>
  }
  if (!session) return (<><TextureOverlay /><LoginScreen onSignIn={signIn} /></>)
  if (!isProfileComplete(profile)) return (<><TextureOverlay /><Onboarding onSubmit={handleOnboard} error={onboardError} /></>)
  return (
    <>
      <TextureOverlay />
      <Hero profile={profile!} mascot={mascot} onSignOut={signOut} onOpenSettings={() => setSettingsOpen(true)} />
      <HomeSections profile={profile!} onProfileChange={setProfile} />
      {settingsOpen && (
        <SettingsModal
          profile={profile!}
          onClose={() => setSettingsOpen(false)}
          onSave={async (v) => {
            try {
              const saved = await upsertProfile(supabase, { id: profile!.id, ...v })
              setProfile(saved)
              setSettingsOpen(false)
            } catch (e) {
              // interests column may not exist yet (migration 0008) — at least
              // persist the primary specialty change instead of losing both.
              console.error(e)
              try {
                const saved = await upsertProfile(supabase, { id: profile!.id, specialty: v.specialty })
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
