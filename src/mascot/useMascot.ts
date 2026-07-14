import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'
import { assignSpeciesIfMissing, recordDailyLogin } from './mascot'
import { deriveMascotState, type MascotState } from './state'
import { todayISO } from './today'

/**
 * Ensures the user has a hatched species and records the once-per-day login,
 * pushing the updated profile back up via onProfileChange. Returns the derived
 * MascotState for rendering (null until a species exists).
 */
export function useMascot(
  profile: Profile | null,
  onProfileChange: (p: Profile) => void,
): MascotState | null {
  const userId = profile?.id
  useEffect(() => {
    if (!profile || !userId) return
    let active = true
    ;(async () => {
      let p = await assignSpeciesIfMissing(supabase, profile, Math.random())
      p = await recordDailyLogin(supabase, p, todayISO())
      if (active) onProfileChange(p)
    })().catch((e) => console.error(e))
    return () => { active = false }
    // Runs once per user; onProfileChange/profile identity intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!profile || !profile.mascot_species) return null
  return deriveMascotState(profile, todayISO())
}
