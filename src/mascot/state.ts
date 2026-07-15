import { levelProgress } from './xp'
import { stageFromProgress, type Stage } from './stage'
import { moodFor, type Mood } from './mood'
import { animalForSpecialty, variantForUser } from './roster'
import { computeDday } from '../lib/dday'
import type { Profile } from '../lib/profile'

export const DEFAULT_MASCOT_NAME = '큐비'

export interface MascotState {
  speciesId: string
  speciesLabel: string
  tint: string
  variantLabel: string
  variantAccent: string
  name: string
  stage: Stage
  mood: Mood
  level: number
  xpInLevel: number
  xpForLevel: number
  streakDays: number
}

/**
 * Species is DERIVED from the profile's specialty (전공별 대표 동물) and the
 * variant from a hash of the user id — profiles.mascot_species is intentionally
 * ignored (kept in the DB only as a future custom-override slot).
 */
export function deriveMascotState(profile: Profile, todayISO: string): MascotState {
  const animal = animalForSpecialty(profile.specialty)
  const variant = variantForUser(profile.id)
  const { percent } = computeDday(
    new Date(profile.training_start ?? todayISO),
    new Date(profile.training_end ?? todayISO),
    new Date(todayISO),
  )
  const { level, xpInLevel, xpForLevel } = levelProgress(profile.xp ?? 0)
  return {
    speciesId: animal.id,
    speciesLabel: animal.label,
    tint: animal.tint,
    variantLabel: variant.label,
    variantAccent: variant.accent,
    name: profile.mascot_name || DEFAULT_MASCOT_NAME,
    stage: stageFromProgress(percent),
    mood: moodFor(profile.last_active_on, todayISO),
    level,
    xpInLevel,
    xpForLevel,
    streakDays: profile.streak_days ?? 0,
  }
}
