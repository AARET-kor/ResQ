import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'
import { assignSpeciesIfMissing, recordDailyLogin } from './mascot'
import { deriveMascotState, type MascotState } from './state'
import { todayISO } from './today'

/**
 * Ensures the user has a hatched species and records the once-per-day login,
 * pushing the updated profile back up via onProfileChange. Returns the derived
 * MascotState for rendering (null until a species exists).
 *
 * Runs the side effect exactly ONCE per user id: `ranFor` survives React
 * StrictMode's mount→cleanup→mount so the ledger isn't double-written in dev,
 * and the result is only applied if the user hasn't changed since (`currentUser`).
 */
export function useMascot(
  profile: Profile | null,
  onProfileChange: (p: Profile) => void,
): MascotState | null {
  const userId = profile?.id
  const ranFor = useRef<string | null>(null)
  const currentUser = useRef<string | undefined>(undefined)
  currentUser.current = userId

  useEffect(() => {
    if (!profile || !userId) return
    if (ranFor.current === userId) return
    ranFor.current = userId
    ;(async () => {
      let p = await assignSpeciesIfMissing(supabase, profile, Math.random())
      p = await recordDailyLogin(supabase, p, todayISO())
      if (currentUser.current === userId) onProfileChange(p)
    })().catch((e) => {
      console.error(e)
      if (ranFor.current === userId) ranFor.current = null // allow a retry next mount
    })
    // Runs once per user id; profile/onProfileChange identity intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!profile || !profile.mascot_species) return null
  return deriveMascotState(profile, todayISO())
}
