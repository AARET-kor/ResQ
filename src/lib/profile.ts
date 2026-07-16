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
