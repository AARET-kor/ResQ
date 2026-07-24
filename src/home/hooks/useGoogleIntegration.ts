import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { useAuth } from '../../auth/AuthProvider'
import { buildICS } from '../../lib/ics'
import { listRecentEmailTexts, requestEventExtraction, type ExtractedEvent } from '../../lib/gmail'
import {
  GOOGLE_AUTH_ERROR,
  refreshGoogleSources,
  syncGoogleIntegration,
} from '../../lib/googleSync'
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
import {
  disconnectIntegration,
  listIntegrationConnections,
  listIntegrationSources,
  setIntegrationSourceSelected,
  startMicrosoftConnection,
  syncMicrosoftIntegration,
  type IntegrationConnection,
  type IntegrationSource,
  type IntegrationSyncResult,
} from '../../lib/integrations'
import {
  connectDeviceCalendar,
  deviceProvider,
  isDeviceCalendarAvailable,
  syncDeviceCalendar,
} from '../../lib/deviceCalendar'

interface UseGoogleIntegrationOptions {
  profile: Profile
  onProfileChange: (profile: Profile) => void
  events: EventItem[]
  todos: Todo[]
  onAddEvent: (event: NewScheduleEvent) => Promise<boolean>
  onExternalDataChanged: () => void
}

export function useGoogleIntegration({
  profile,
  onProfileChange,
  events,
  todos,
  onAddEvent,
  onExternalDataChanged,
}: UseGoogleIntegrationOptions) {
  const { providerToken, reconnectGoogle } = useAuth()
  const { notify } = useNotifications()
  const [message, setMessage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingProvider, setSyncingProvider] = useState<
    'google' | 'microsoft' | 'apple' | 'android' | null
  >(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [sources, setSources] = useState<IntegrationSource[]>([])
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [extracted, setExtracted] = useState<ExtractedEvent[]>([])
  const [addingExtracted, setAddingExtracted] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [audits, setAudits] = useState<GmailAuditEvent[]>([])
  const [deletingAudits, setDeletingAudits] = useState(false)
  const syncingRef = useRef(false)
  const catalogLoadingRef = useRef(false)
  const scanningRef = useRef(false)
  const addingExtractedRef = useRef(false)
  const gmailConsentGranted = hasCurrentGmailConsent(profile)
  const googleSources = sources.filter((source) => source.provider === 'google')
  const microsoftSources = sources.filter((source) => source.provider === 'microsoft')
  const microsoftConnection = connections.find(
    (connection) => connection.provider === 'microsoft' && connection.status === 'active',
  ) ?? null
  const nativeDeviceAvailable = isDeviceCalendarAvailable()
  const nativeDeviceProvider = deviceProvider()
  const deviceSources = nativeDeviceProvider
    ? sources.filter((source) => source.provider === nativeDeviceProvider)
    : []

  const reloadIntegrationState = async () => {
    const [nextSources, nextConnections] = await Promise.all([
      listIntegrationSources(supabase, profile.id),
      listIntegrationConnections(supabase, profile.id),
    ])
    setSources(nextSources)
    setConnections(nextConnections)
    return { sources: nextSources, connections: nextConnections }
  }

  useEffect(() => {
    let active = true
    Promise.all([
      listIntegrationSources(supabase, profile.id),
      listIntegrationConnections(supabase, profile.id),
    ]).then(([nextSources, nextConnections]) => {
      if (!active) return
      setSources(nextSources)
      setConnections(nextConnections)
    }).catch((error) => {
      console.error(error)
      if (active) notify({
        message: requestErrorMessage(error, '외부 연동 설정을 불러오지 못했습니다.'),
        tone: 'warning',
      })
    })

    const url = new URL(window.location.href)
    const integrationResult = url.searchParams.get('integration')
    if (integrationResult) {
      url.searchParams.delete('integration')
      url.searchParams.delete('reason')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      if (integrationResult === 'microsoft-connected') {
        notify({ message: 'Microsoft 계정이 연결되었습니다.', tone: 'success' })
      } else if (integrationResult === 'microsoft-error') {
        notify({
          message: 'Microsoft 계정을 연결하지 못했습니다. 설정을 확인해주세요.',
          tone: 'error',
        })
      }
    }
    return () => { active = false }
  }, [notify, profile.id])

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

  const formatSyncResult = (provider: string, result: IntegrationSyncResult) => {
    const imported = result.importedEvents + result.importedTasks
    const pushed = result.pushedEvents + result.pushedTasks
    const deleted = result.deletedEvents + result.deletedTasks
    return `${provider}: 가져오기 ${imported}건 · 보내기 ${pushed}건${deleted ? ` · 삭제 반영 ${deleted}건` : ''}`
  }

  const refreshGoogleCatalog = async () => {
    if (!providerToken || catalogLoadingRef.current) return googleSources
    catalogLoadingRef.current = true
    setCatalogLoading(true)
    try {
      const next = await refreshGoogleSources(supabase, profile.id, providerToken)
      setSources((current) => [
        ...current.filter((source) => source.provider !== 'google'),
        ...next,
      ])
      return next
    } catch (error) {
      console.error(error)
      const failure = requestErrorMessage(error, 'Google 캘린더와 할 일 목록을 불러오지 못했습니다.')
      setMessage(failure)
      notify({
        message: failure,
        tone: 'error',
        action: { label: '다시 연결', onClick: () => { void reconnectGoogle() } },
      })
      return []
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }

  const syncGoogle = async () => {
    if (!providerToken || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setSyncingProvider('google')
    setMessage('Google 일정과 할 일을 동기화하는 중…')
    try {
      let activeSources = googleSources
      if (activeSources.length === 0) activeSources = await refreshGoogleCatalog()
      if (!activeSources.some((source) => source.selected)) {
        const warning = '동기화할 Google 캘린더 또는 할 일 목록을 하나 이상 선택해주세요.'
        setMessage(warning)
        notify({ message: warning, tone: 'warning' })
        return
      }
      const result = await syncGoogleIntegration(
        supabase,
        profile.id,
        providerToken,
        activeSources,
      )
      setMessage(formatSyncResult('Google', result))
      onExternalDataChanged()
      await reloadIntegrationState()
      notify({ message: 'Google 일정과 할 일 동기화를 완료했습니다.', tone: 'success' })
    } catch (error) {
      console.error(error)
      const expired = error instanceof Error && error.message === GOOGLE_AUTH_ERROR
      const failure = requestErrorMessage(
        error,
        expired ? GOOGLE_AUTH_ERROR : 'Google 동기화에 실패했습니다.',
      )
      setMessage(failure)
      notify({
        message: failure,
        tone: 'error',
        action: expired
          ? { label: '다시 연결', onClick: () => { void reconnectGoogle() } }
          : { label: '재시도', onClick: () => { void syncGoogle() } },
      })
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setSyncingProvider(null)
    }
  }

  const toggleSource = async (source: IntegrationSource) => {
    const selected = !source.selected
    setSources((current) => current.map((item) => (
      item.id === source.id ? { ...item, selected } : item
    )))
    try {
      await setIntegrationSourceSelected(supabase, source.id, selected)
    } catch (error) {
      console.error(error)
      setSources((current) => current.map((item) => (
        item.id === source.id ? source : item
      )))
      notify({
        message: requestErrorMessage(error, '동기화 목록 선택을 저장하지 못했습니다.'),
        tone: 'error',
      })
    }
  }

  const connectMicrosoft = async () => {
    if (catalogLoadingRef.current) return
    catalogLoadingRef.current = true
    setCatalogLoading(true)
    try {
      const native = Capacitor.isNativePlatform()
      const authorizationUrl = await startMicrosoftConnection(
        supabase,
        native
          ? 'com.resq.medical://integration/callback'
          : `${window.location.origin}${window.location.pathname}`,
      )
      if (native) await Browser.open({ url: authorizationUrl })
      else window.location.assign(authorizationUrl)
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, 'Microsoft 연결을 시작하지 못했습니다.'),
        tone: 'error',
      })
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }

  const syncMicrosoft = async () => {
    if (!microsoftConnection || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setSyncingProvider('microsoft')
    setMessage('Outlook 일정과 Microsoft To Do를 동기화하는 중…')
    try {
      const result = await syncMicrosoftIntegration(supabase)
      setMessage(formatSyncResult('Microsoft', result))
      onExternalDataChanged()
      await reloadIntegrationState()
      notify({ message: 'Microsoft 일정과 할 일 동기화를 완료했습니다.', tone: 'success' })
    } catch (error) {
      console.error(error)
      const failure = requestErrorMessage(error, 'Microsoft 동기화에 실패했습니다.')
      setMessage(failure)
      notify({
        message: failure,
        tone: 'error',
        action: { label: '재시도', onClick: () => { void syncMicrosoft() } },
      })
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setSyncingProvider(null)
    }
  }

  const disconnectMicrosoft = async () => {
    if (!microsoftConnection) return
    try {
      await disconnectIntegration(supabase, microsoftConnection.id)
      setConnections((current) => current.filter((item) => item.id !== microsoftConnection.id))
      setSources((current) => current.filter((source) => source.provider !== 'microsoft'))
      notify({ message: 'Microsoft 연결을 해제했습니다.', tone: 'success' })
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, 'Microsoft 연결을 해제하지 못했습니다.'),
        tone: 'error',
      })
    }
  }

  const connectDevice = async () => {
    if (!nativeDeviceAvailable || catalogLoadingRef.current) return
    catalogLoadingRef.current = true
    setCatalogLoading(true)
    try {
      const result = await connectDeviceCalendar(supabase, profile.id)
      setSources((current) => [
        ...current.filter((source) => source.provider !== result.permissions.platform),
        ...result.sources,
      ])
      const label = result.permissions.platform === 'apple'
        ? 'Apple Calendar·Reminders'
        : '기기 캘린더'
      notify({ message: `${label} 접근이 연결되었습니다.`, tone: 'success' })
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '기기 캘린더 접근을 연결하지 못했습니다.'),
        tone: 'error',
      })
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }

  const syncDevice = async () => {
    if (!nativeDeviceProvider || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setSyncingProvider(nativeDeviceProvider)
    const providerLabel = nativeDeviceProvider === 'apple'
      ? 'Apple Calendar·Reminders'
      : '기기 캘린더'
    setMessage(`${providerLabel}를 동기화하는 중…`)
    try {
      let activeSources = deviceSources
      if (activeSources.length === 0) {
        const result = await connectDeviceCalendar(supabase, profile.id)
        activeSources = result.sources
        setSources((current) => [
          ...current.filter((source) => source.provider !== nativeDeviceProvider),
          ...activeSources,
        ])
      }
      if (!activeSources.some((source) => source.selected)) {
        const warning = '동기화할 기기 캘린더 또는 미리 알림 목록을 선택해주세요.'
        setMessage(warning)
        notify({ message: warning, tone: 'warning' })
        return
      }
      const result = await syncDeviceCalendar(
        supabase,
        profile.id,
        activeSources,
      )
      setMessage(formatSyncResult(providerLabel, result))
      onExternalDataChanged()
      await reloadIntegrationState()
      notify({ message: `${providerLabel} 동기화를 완료했습니다.`, tone: 'success' })
    } catch (error) {
      console.error(error)
      const failure = requestErrorMessage(error, `${providerLabel} 동기화에 실패했습니다.`)
      setMessage(failure)
      notify({
        message: failure,
        tone: 'error',
        action: { label: '재시도', onClick: () => { void syncDevice() } },
      })
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setSyncingProvider(null)
    }
  }

  const legacySyncMonth = async () => {
    // Kept as an internal alias while call sites transition to the unified
    // calendar + task sync action.
    await syncGoogle()
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
    microsoftIntegrationAvailable:
      import.meta.env.VITE_MICROSOFT_INTEGRATION_ENABLED === 'true',
    microsoftConnected: Boolean(microsoftConnection),
    microsoftAccountLabel: microsoftConnection?.account_email
      ?? microsoftConnection?.account_label
      ?? null,
    googleSources,
    microsoftSources,
    deviceSources,
    nativeDeviceAvailable,
    nativeDeviceProvider,
    catalogLoading,
    syncing,
    syncingProvider,
    scanning,
    message,
    extracted,
    addingExtracted,
    gmailConsentGranted,
    consentBusy,
    audits,
    deletingAudits,
    feedUrl,
    syncMonth: legacySyncMonth,
    syncGoogle,
    refreshGoogleCatalog,
    toggleSource,
    connectMicrosoft,
    syncMicrosoft,
    disconnectMicrosoft,
    connectDevice,
    syncDevice,
    reconnectGoogle,
    downloadIcs,
    scanGmail,
    addExtracted,
    grantConsent,
    revokeConsent,
    deleteAudits,
    dismissExtracted: () => setExtracted([]),
  }
}
