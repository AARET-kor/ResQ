import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertProfile, type Profile } from '../lib/profile'
import { pickSpecies } from './species'
import { XP_AMOUNTS } from './events'
import { prevDayISO } from './today'

/** Assign a random species on first hatch; no-op if one already exists. */
export async function assignSpeciesIfMissing(
  client: SupabaseClient,
  profile: Profile,
  rand: number,
): Promise<Profile> {
  if (profile.mascot_species) return profile
  return upsertProfile(client, { id: profile.id, mascot_species: pickSpecies(rand) })
}

/** Grant daily-login XP once per calendar day; updates streak and appends to the ledger. */
export async function recordDailyLogin(
  client: SupabaseClient,
  profile: Profile,
  todayISO: string,
): Promise<Profile> {
  if (profile.last_active_on === todayISO) return profile
  const amount = XP_AMOUNTS.daily_login
  await client.from('xp_events').insert({ user_id: profile.id, type: 'daily_login', amount })
  const continued = profile.last_active_on === prevDayISO(todayISO)
  const streak = continued ? (profile.streak_days ?? 0) + 1 : 1
  return upsertProfile(client, {
    id: profile.id,
    xp: (profile.xp ?? 0) + amount,
    last_active_on: todayISO,
    streak_days: streak,
  })
}
