import type { SupabaseClient } from '@supabase/supabase-js'

export interface Profile {
  id: string
  hospital: string | null
  specialty: string | null
  pgy: number | null
  nickname: string | null
  training_start: string | null // ISO date
  training_end: string | null   // ISO date
  xp: number
  mascot_level: number
  mascot_stage: number
  mascot_species?: string | null
  mascot_name?: string | null
  last_active_on?: string | null // ISO date
  streak_days?: number | null
  ics_token?: string | null
  interests?: string | null
  gmail_ai_consent_at?: string | null
  gmail_ai_consent_revoked_at?: string | null
  privacy_policy_version?: string | null
}

export async function getProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile) ?? null
}

export async function upsertProfile(
  client: SupabaseClient,
  values: Partial<Profile> & { id: string },
): Promise<Profile> {
  const { data, error } = await client
    .from('profiles')
    .upsert({ ...values, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw error
  return data as Profile
}

const REQUIRED: (keyof Profile)[] = [
  'hospital', 'specialty', 'pgy', 'nickname', 'training_start', 'training_end',
]

export function isProfileComplete(p: Profile | null): boolean {
  if (!p) return false
  return REQUIRED.every((k) => p[k] !== null && p[k] !== undefined && p[k] !== '')
}

/** "성형외과,피부과" → ['성형외과','피부과'] (trimmed, deduped, empty-safe). */
export function parseInterests(interests: string | null | undefined): string[] {
  if (!interests) return []
  return [...new Set(interests.split(',').map((s) => s.trim()).filter(Boolean))]
}

/** The user's paper feed specialties: primary first, then interests, deduped. */
export function feedSpecialties(p: { specialty: string | null; interests?: string | null }): string[] {
  return [...new Set([p.specialty ?? '', ...parseInterests(p.interests)].filter(Boolean))]
}
