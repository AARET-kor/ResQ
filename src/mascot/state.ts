import { levelProgress } from './xp'
import { stageFromProgress, type Stage } from './stage'
import { moodFor, type Mood } from './mood'
import { SPECIES, speciesById } from './roster'
import { computeDday } from '../lib/dday'
import type { Profile } from '../lib/profile'

export const DEFAULT_MASCOT_NAME = '큐비'

export interface MascotState {
  speciesId: string
  speciesLabel: string
  tint: string
  name: string
  stage: Stage
  mood: Mood
  level: number
  xpInLevel: number
  xpForLevel: number
  streakDays: number
}

export function deriveMascotState(profile: Profile, todayISO: string): MascotState {
  const species = speciesById(profile.mascot_species ?? '') ?? SPECIES[0]
  const { percent } = computeDday(
    new Date(profile.training_start ?? todayISO),
    new Date(profile.training_end ?? todayISO),
    new Date(todayISO),
  )
  const { level, xpInLevel, xpForLevel } = levelProgress(profile.xp ?? 0)
  return {
    speciesId: species.id,
    speciesLabel: species.label,
    tint: species.tint,
    name: profile.mascot_name || DEFAULT_MASCOT_NAME,
    stage: stageFromProgress(percent),
    mood: moodFor(profile.last_active_on, todayISO),
    level,
    xpInLevel,
    xpForLevel,
    streakDays: profile.streak_days ?? 0,
  }
}
