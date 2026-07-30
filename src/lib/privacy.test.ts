import { describe, expect, it } from 'vitest'
import { hasCurrentGmailConsent, PRIVACY_POLICY_VERSION, redactSensitiveText } from './privacy'
import type { Profile } from './profile'

const profile: Profile = {
  id: 'u1', hospital: '병원', specialty: '내과', pgy: 1, nickname: '사용자',
  training_start: '2026-01-01', training_end: '2027-01-01',
  xp: 0, mascot_level: 1, mascot_stage: 1,
}

describe('email privacy controls', () => {
  it('redacts common patient identifiers', () => {
    const redacted = redactSensitiveText(
      '환자명: 김철수 등록번호 AB-12345 주민번호 900101-1234567 연락처 010-1234-5678 kim@example.com',
    )
    expect(redacted).not.toContain('김철수')
    expect(redacted).not.toContain('AB-12345')
    expect(redacted).not.toContain('900101-1234567')
    expect(redacted).not.toContain('010-1234-5678')
    expect(redacted).not.toContain('kim@example.com')
    expect(redacted).toContain('[이름 제거]')
  })

  it('requires consent to the current policy version', () => {
    expect(hasCurrentGmailConsent(profile)).toBe(false)
    expect(hasCurrentGmailConsent({
      ...profile,
      gmail_ai_consent_at: '2026-07-24T00:00:00.000Z',
      privacy_policy_version: PRIVACY_POLICY_VERSION,
    })).toBe(true)
  })

  it('treats a later revocation as no consent', () => {
    expect(hasCurrentGmailConsent({
      ...profile,
      gmail_ai_consent_at: '2026-07-24T00:00:00.000Z',
      gmail_ai_consent_revoked_at: '2026-07-25T00:00:00.000Z',
      privacy_policy_version: PRIVACY_POLICY_VERSION,
    })).toBe(false)
  })
})
