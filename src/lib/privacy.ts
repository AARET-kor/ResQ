import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertProfile, type Profile } from './profile'

export const PRIVACY_POLICY_VERSION = '2026-07-24'

export interface GmailAuditEvent {
  id: number
  status: 'started' | 'completed' | 'failed'
  email_count: number
  masked_char_count: number
  candidates_count: number | null
  error_code: string | null
  created_at: string
  completed_at: string | null
}

const REDACTION_RULES: { pattern: RegExp; replacement: string }[] = [
  {
    pattern: /((?:환자명|성명|이름)\s*[:：]?\s*)[가-힣]{2,5}/gi,
    replacement: '$1[이름 제거]',
  },
  {
    pattern: /((?:환자번호|등록번호|차트번호|병록번호|MRN)\s*[:：#-]?\s*)[A-Z0-9-]{4,}/gi,
    replacement: '$1[등록번호 제거]',
  },
  {
    pattern: /((?:생년월일|DOB)\s*[:：]?\s*)\d{2,4}[-./]\d{1,2}[-./]\d{1,2}/gi,
    replacement: '$1[생년월일 제거]',
  },
  {
    pattern: /\b\d{6}-?[1-4]\d{6}\b/g,
    replacement: '[주민번호 제거]',
  },
  {
    pattern: /\b01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g,
    replacement: '[전화번호 제거]',
  },
  {
    pattern: /\b(?:0\d{1,2})[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g,
    replacement: '[전화번호 제거]',
  },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[이메일 제거]',
  },
]

/** Defense-in-depth redaction before email text leaves the browser. */
export function redactSensitiveText(value: string): string {
  return REDACTION_RULES.reduce(
    (redacted, rule) => redacted.replace(rule.pattern, rule.replacement),
    value,
  )
}

export function hasCurrentGmailConsent(profile: Profile): boolean {
  if (!profile.gmail_ai_consent_at) return false
  if (profile.privacy_policy_version !== PRIVACY_POLICY_VERSION) return false
  if (!profile.gmail_ai_consent_revoked_at) return true
  return profile.gmail_ai_consent_at > profile.gmail_ai_consent_revoked_at
}

export async function grantGmailAiConsent(
  client: SupabaseClient,
  profile: Profile,
): Promise<Profile> {
  return upsertProfile(client, {
    id: profile.id,
    gmail_ai_consent_at: new Date().toISOString(),
    gmail_ai_consent_revoked_at: null,
    privacy_policy_version: PRIVACY_POLICY_VERSION,
  })
}

export async function revokeGmailAiConsent(
  client: SupabaseClient,
  profile: Profile,
): Promise<Profile> {
  return upsertProfile(client, {
    id: profile.id,
    gmail_ai_consent_revoked_at: new Date().toISOString(),
  })
}

export async function listGmailAuditEvents(
  client: SupabaseClient,
  userId: string,
): Promise<GmailAuditEvent[]> {
  const { data, error } = await client
    .from('gmail_ai_audit_events')
    .select('id,status,email_count,masked_char_count,candidates_count,error_code,created_at,completed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return (data as GmailAuditEvent[]) ?? []
}

export async function deleteMyGmailAuditEvents(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('delete_my_gmail_audit_events')
  if (error) throw error
}
