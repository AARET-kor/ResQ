import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertProfile, type Profile } from '../lib/profile'
import { XP_AMOUNTS, type XpEventType } from './events'
import { prevDayISO, todayISO } from './today'

/** Grant daily-login XP once per calendar day; updates streak and appends to the ledger. */
export async function recordDailyLogin(
  client: SupabaseClient,
  profile: Profile,
  todayISO: string,
): Promise<Profile> {
  if (profile.last_active_on === todayISO) return profile
  const amount = XP_AMOUNTS.daily_login
  // The (user_id, day) unique index makes this the source of truth for "once per
  // day": if a concurrent/StrictMode run already inserted today's login, this
  // insert errors and we return without granting XP again.
  const { error } = await client
    .from('xp_events')
    .insert({ user_id: profile.id, type: 'daily_login', amount, day: todayISO })
  if (error) return profile
  const continued = profile.last_active_on === prevDayISO(todayISO)
  const streak = continued ? (profile.streak_days ?? 0) + 1 : 1
  return upsertProfile(client, {
    id: profile.id,
    xp: (profile.xp ?? 0) + amount,
    last_active_on: todayISO,
    streak_days: streak,
  })
}

/**
 * Generic XP grant for non-login events (schedule_done, read_paper, …).
 * No per-day uniqueness — callers guard repetition themselves (e.g. a todo's
 * xp_granted flag). `day` is recorded for consistency with the ledger schema.
 */
export async function recordXpEvent(
  client: SupabaseClient,
  profile: Profile,
  type: Exclude<XpEventType, 'daily_login'>,
): Promise<Profile> {
  const amount = XP_AMOUNTS[type]
  const { error } = await client
    .from('xp_events')
    .insert({ user_id: profile.id, type, amount, day: todayISO() })
  if (error) return profile
  // Re-read the stored xp before adding: two grants fired from the same render
  // window would otherwise both add to the same stale closure value and one
  // grant would be lost on upsert. The ledger insert above stays authoritative.
  const { data } = await client
    .from('profiles')
    .select('xp')
    .eq('id', profile.id)
    .maybeSingle()
  const baseXp = (data as { xp?: number } | null)?.xp ?? profile.xp ?? 0
  return upsertProfile(client, { id: profile.id, xp: baseXp + amount })
}
