import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { buildICS } from '../../lib/ics'
import { insertGoogleEvent, markEventSynced, GOOGLE_AUTH_ERROR } from '../../lib/gcal'
import { listRecentEmailTexts, requestEventExtraction, type ExtractedEvent } from '../../lib/gmail'
import type { EventItem } from '../../lib/events'
import type { Todo } from '../../lib/todos'
import type { Profile } from '../../lib/profile'
import { supabase } from '../../lib/supabase'
import type { NewScheduleEvent } from './useSchedule'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'
import {
  deleteMyGmailAuditEvents,
  grantGmailAiConsent,
  hasCurrentGmailConsent,
  listGmailAuditEvents,
  revokeGmailAiConsent,
  type GmailAuditEvent,
} from '../../lib/privacy'

interface UseGoogleIntegrationOptions {
  profile: Profile
  onProfileChange: (profile: Profile) => void
  events: EventItem[]
  todos: Todo[]
  onAddEvent: (event: NewScheduleEvent) => Promise<boolean>
  onEventSynced: (eventId: string, googleEventId: string) => void
}

export function useGoogleIntegration({
  profile,
  onProfileChange,
  events,
  todos,
  onAddEvent,
  onEventSynced,
}: UseGoogleIntegrationOptions) {
  const { providerToken } = useAuth()
  const { notify } = useNotifications()
  const [message, setMessage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedEvent[]>([])
  const [addingExtracted, setAddingExtracted] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [audits, setAudits] = useState<GmailAuditEvent[]>([])
  const [deletingAudits, setDeletingAudits] = useState(false)
  const syncingRef = useRef(false)
  const scanningRef = useRef(false)
  const addingExtractedRef = useRef(false)
  const gmailConsentGranted = hasCurrentGmailConsent(profile)

  const refreshAudits = () => {
    listGmailAuditEvents(supabase, profile.id)
      .then(setAudits)
      .catch((error) => {
        console.error(error)
        notify({
          message: requestErrorMessage(error, 'Gmail AI 처리 기록을 불러오지 못했습니다.'),
          tone: 'warning',
        })
      })
  }

  useEffect(() => {
    if (gmailConsentGranted) refreshAudits()
    else setAudits([])
    // The profile consent fields are the intended reload trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gmailConsentGranted,
    profile.gmail_ai_consent_at,
    profile.gmail_ai_consent_revoked_at,
    profile.id,
  ])

  const grantConsent = async () => {
    if (consentBusy) return false
    setConsentBusy(true)
    try {
      onProfileChange(await grantGmailAiConsent(supabase, profile))
      notify({ message: 'Gmail AI 처리 동의가 저장되었습니다.', tone: 'success' })
      return true
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, 'Gmail AI 처리 동의를 저장하지 못했습니다.'),
        tone: 'error',
      })
      return false
    } finally {
      setConsentBusy(false)
    }
  }

  const revokeConsent = async () => {
    if (consentBusy) return
    setConsentBusy(true)
    try {
      onProfileChange(await revokeGmailAiConsent(supabase, profile))
      notify({ message: 'Gmail AI 처리 동의를 철회했습니다.', tone: 'success' })
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, 'Gmail AI 처리 동의를 철회하지 못했습니다.'),
        tone: 'error',
      })
    } finally {
      setConsentBusy(false)
    }
  }

  const deleteAudits = async () => {
    if (deletingAudits) return
    setDeletingAudits(true)
    try {
      await deleteMyGmailAuditEvents(supabase)
      setAudits([])
      notify({ message: 'Gmail AI 처리 기록을 삭제했습니다.', tone: 'success' })
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, 'Gmail AI 처리 기록을 삭제하지 못했습니다.'),
        tone: 'error',
      })
    } finally {
      setDeletingAudits(false)
    }
  }

  const syncMonth = async () => {
    if (!providerToken || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setMessage('동기화 중…')
    let succeeded = 0
    let failed = 0
    try {
      for (const event of events.filter((item) => !item.gcal_id)) {
        try {
          const googleEventId = await insertGoogleEvent(providerToken, event)
          await markEventSynced(supabase, event.id, googleEventId)
          onEventSynced(event.id, googleEventId)
          succeeded++
        } catch (error) {
          failed++
          if (error instanceof Error && error.message === GOOGLE_AUTH_ERROR) {
            setMessage(GOOGLE_AUTH_ERROR)
            return
          }
        }
      }
      setMessage(
        failed
          ? `${succeeded}건 동기화, ${failed}건 실패`
          : succeeded
            ? `${succeeded}건 동기화 완료`
            : '이번 달에 새로 보낼 일정이 없습니다',
      )
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }

  const downloadIcs = () => {
    const anchor = document.createElement('a')
    anchor.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildICS(events, todos))}`
    anchor.download = 'resq.ics'
    anchor.click()
  }

  const scanGmail = async () => {
    if (!providerToken || scanningRef.current) return
    if (!gmailConsentGranted) {
      notify({ message: 'Gmail AI 처리에 먼저 동의해주세요.', tone: 'warning' })
      return
    }
    scanningRef.current = true
    setScanning(true)
    setMessage(null)
    try {
      const emails = await listRecentEmailTexts(providerToken)
      if (emails.length === 0) {
        setMessage('최근 2주 메일에서 일정 후보를 찾지 못했습니다')
        return
      }
      const candidates = await requestEventExtraction(supabase, emails, profile.specialty)
      setExtracted(candidates)
      refreshAudits()
      if (candidates.length === 0) setMessage('메일에서 일정을 찾지 못했습니다')
    } catch (error) {
      console.error(error)
      const failure = requestErrorMessage(error, error instanceof Error ? error.message : '메일 스캔에 실패했습니다')
      setMessage(failure)
      notify({
        message: failure,
        tone: 'error',
        action: { label: '재시도', onClick: () => { void scanGmail() } },
      })
    } finally {
      scanningRef.current = false
      setScanning(false)
    }
  }

  const addExtracted = async (candidate: ExtractedEvent) => {
    if (addingExtractedRef.current) return
    addingExtractedRef.current = true
    setAddingExtracted(true)
    try {
      const added = await onAddEvent({
        title: candidate.title,
        starts_at: candidate.starts_at,
        kind: candidate.kind,
      })
      if (!added) return
      setExtracted((current) => current.filter((event) => event !== candidate))
      setMessage(`'${candidate.title}' 일정을 추가했습니다`)
    } catch (error) {
      console.error(error)
    } finally {
      addingExtractedRef.current = false
      setAddingExtracted(false)
    }
  }

  const feedUrl = profile.ics_token
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${profile.ics_token}`
    : null

  return {
    googleConnected: Boolean(providerToken),
    syncing,
    scanning,
    message,
    extracted,
    addingExtracted,
    gmailConsentGranted,
    consentBusy,
    audits,
    deletingAudits,
    feedUrl,
    syncMonth,
    downloadIcs,
    scanGmail,
    addExtracted,
    grantConsent,
    revokeConsent,
    deleteAudits,
    dismissExtracted: () => setExtracted([]),
  }
}
