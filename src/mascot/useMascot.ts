import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'
import { recordDailyLogin } from './mascot'
import { deriveMascotState, type MascotState } from './state'
import { todayISO } from './today'

/**
 * Records the once-per-day login (XP/streak) and returns the derived
 * MascotState (species from specialty, variant from user-id hash).
 *
 * The side effect runs exactly ONCE per user id: `ranFor` survives React
 * StrictMode's mount→cleanup→mount so the ledger isn't double-written in dev,
 * and the result is only applied if the user hasn't changed since.
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
    recordDailyLogin(supabase, profile, todayISO())
      .then((p) => {
        if (currentUser.current === userId) onProfileChange(p)
      })
      .catch((e) => {
        console.error(e)
        if (ranFor.current === userId) ranFor.current = null // allow retry next mount
      })
    // Runs once per user id; profile/onProfileChange identity intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!profile) return null
  return deriveMascotState(profile, todayISO())
}
