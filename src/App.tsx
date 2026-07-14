import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import { getProfile, upsertProfile, isProfileComplete, type Profile } from './lib/profile'
import { LoginScreen } from './components/LoginScreen'
import { Onboarding, type OnboardingValues } from './components/Onboarding'
import { Hero } from './components/Hero'
import { TextureOverlay } from './components/TextureOverlay'

export default function App() {
  const { session, loading, signIn, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    getProfile(supabase, userId)
      .then(setProfile)
      .finally(() => setProfileLoading(false))
  }, [userId])

  const handleOnboard = async (v: OnboardingValues) => {
    if (!userId) return
    const saved = await upsertProfile(supabase, { id: userId, ...v })
    setProfile(saved)
  }

  if (loading || (userId && profileLoading)) {
    return <div className="flex min-h-screen items-center justify-center font-mono text-sm uppercase text-cream/60">loading…</div>
  }
  if (!session) return (<><TextureOverlay /><LoginScreen onSignIn={signIn} /></>)
  if (!isProfileComplete(profile)) return (<><TextureOverlay /><Onboarding onSubmit={handleOnboard} /></>)
  return (<><TextureOverlay /><Hero profile={profile!} onSignOut={signOut} /></>)
}
