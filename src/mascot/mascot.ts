import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '../lib/profile'

/** Server-authoritative once-per-KST-day login reward and streak update. */
export async function recordDailyLogin(
  client: SupabaseClient,
  profile: Profile,
  _clientDay: string,
): Promise<Profile> {
  const { data, error } = await client.rpc('grant_daily_login_xp')
  if (error) throw error
  return (data as Profile | null) ?? profile
}

/** Server-authoritative paper reward, fixed at +20 and unique per PMID. */
export async function recordXpEvent(
  client: SupabaseClient,
  profile: Profile,
  type: 'read_paper',
  sourceKey: string,
): Promise<Profile> {
  if (type !== 'read_paper') throw new Error('unsupported client XP event')
  const { data, error } = await client.rpc('grant_paper_read_xp', { p_pmid: sourceKey })
  if (error) throw error
  return (data as Profile | null) ?? profile
}
