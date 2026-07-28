import { useEffect, useRef, useState } from 'react'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '../../auth/AuthProvider'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'
import { connectDeviceCalendar, deviceProvider, isDeviceCalendarAvailable, syncDeviceCalendar } from '../../lib/deviceCalendar'
import type { EventItem } from '../../lib/events'
import { listRecentEmailTexts, requestEventExtraction, type ExtractedEvent } from '../../lib/gmail'
import { buildICS } from '../../lib/ics'
import { importICSFile } from '../../lib/icsImport'
import {
  configureDirectIntegration,
  discoverExternalSources,
  disconnectIntegration,
  getIntegrationCapabilities,
  listIntegrationConnections,
  listIntegrationSources,
  setIntegrationSourceMode,
  setIntegrationSourceSelected,
  staleAutoSyncConnections,
  startOAuthConnection,
  syncExternalIntegration,
  type IntegrationCapabilities,
  type IntegrationConnection,
  type IntegrationProvider,
  type IntegrationSource,
  type IntegrationSyncMode,
  type IntegrationSyncResult,
} from '../../lib/integrations'
import type { Profile } from '../../lib/profile'
import {
  deleteMyGmailAuditEvents,
  grantGmailAiConsent,
  hasCurrentGmailConsent,
  listGmailAuditEvents,
  revokeGmailAiConsent,
  type GmailAuditEvent,
} from '../../lib/privacy'
import { supabase } from '../../lib/supabase'
import type { Todo } from '../../lib/todos'
import type { NewScheduleEvent } from './useSchedule'

type SyncableProvider = 'google' | 'microsoft' | 'todoist' | 'ics' | 'caldav'
type BusyProvider = SyncableProvider | 'apple' | 'android' | null
interface LastSyncSummary {
  provider: string
  result: IntegrationSyncResult
  automatic: boolean
  completedAt: string
}

const LABEL: Record<SyncableProvider, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  todoist: 'Todoist',
  ics: 'ICS',
  caldav: 'CalDAV',
}

const EMPTY_CAPABILITIES: IntegrationCapabilities = {
  google: false,
  microsoft: false,
  todoist: false,
  ics: true,
  caldav: false,
}

interface Options {
  profile: Profile
  onProfileChange: (profile: Profile) => void
  events: EventItem[]
  todos: Todo[]
  online?: boolean
  onAddEvent: (event: NewScheduleEvent) => Promise<boolean>
  onExternalDataChanged: () => void
}

export function useGoogleIntegration({
  profile,
  onProfileChange,
  events,
  todos,
  online = true,
  onAddEvent,
  onExternalDataChanged,
}: Options) {
  const { providerToken, reconnectGoogle } = useAuth()
  const { notify } = useNotifications()
  const [message, setMessage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingProvider, setSyncingProvider] = useState<BusyProvider>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [sources, setSources] = useState<IntegrationSource[]>([])
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [capabilities, setCapabilities] = useState(EMPTY_CAPABILITIES)
  const [sourcePendingIds, setSourcePendingIds] = useState<Set<string>>(new Set())
  const [lastSyncSummary, setLastSyncSummary] = useState<LastSyncSummary | null>(null)
  const [extracted, setExtracted] = useState<ExtractedEvent[]>([])
  const [addingExtracted, setAddingExtracted] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [audits, setAudits] = useState<GmailAuditEvent[]>([])
  const [deletingAudits, setDeletingAudits] = useState(false)
  const syncingRef = useRef(false)
  const catalogLoadingRef = useRef(false)
  const scanningRef = useRef(false)
  const addingExtractedRef = useRef(false)
  const sourcePendingRef = useRef(new Set<string>())
  const autoSyncAttemptedRef = useRef(new Set<string>())
  const gmailConsentGranted = hasCurrentGmailConsent(profile)
  const nativeDeviceAvailable = isDeviceCalendarAvailable()
  const nativeDeviceProvider = deviceProvider()

  const connection = (provider: IntegrationProvider) => connections.find(
    (item) => item.provider === provider && ['active', 'error'].includes(item.status),
  ) ?? null
  const sourcesFor = (provider: IntegrationProvider) => sources.filter(
    (source) => source.provider === provider,
  )
  const googleConnection = connection('google')
  const microsoftConnection = connection('microsoft')
  const todoistConnection = connection('todoist')
  const icsConnection = connection('ics')
  const caldavConnection = connection('caldav')
  const deviceSources = nativeDeviceProvider ? sourcesFor(nativeDeviceProvider) : []

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
      getIntegrationCapabilities(supabase).catch(() => EMPTY_CAPABILITIES),
    ]).then(([nextSources, nextConnections, nextCapabilities]) => {
      if (!active) return
      setSources(nextSources)
      setConnections(nextConnections)
      setCapabilities(nextCapabilities)
    }).catch((error) => {
      console.error(error)
      if (active) notify({
        message: requestErrorMessage(error, '외부 연동 설정을 불러오지 못했습니다.'),
        tone: 'warning',
      })
    }).finally(() => {
      if (active) setCatalogLoading(false)
    })

    const url = new URL(window.location.href)
    const result = url.searchParams.get('integration')
    if (result) {
      const reason = url.searchParams.get('reason')
      url.searchParams.delete('integration')
      url.searchParams.delete('reason')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      const provider = result.split('-')[0]
      if (result.endsWith('-connected')) {
        notify({
          message: `${LABEL[provider as SyncableProvider] ?? provider} 계정이 연결되었습니다. 이제 가져올 목록을 확인해주세요.`,
          tone: 'success',
        })
      } else {
        const detail = reason === 'access_denied'
          ? '권한 승인이 취소되었습니다.'
          : reason === 'expired'
            ? '연결 시간이 만료되었습니다. 다시 시도해주세요.'
            : '계정 승인 과정이 완료되지 않았습니다.'
        notify({ message: `외부 계정을 연결하지 못했습니다. ${detail}`, tone: 'error' })
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
      notify({ message: requestErrorMessage(error, 'Gmail AI 처리 동의를 저장하지 못했습니다.'), tone: 'error' })
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
      notify({ message: requestErrorMessage(error, 'Gmail AI 처리 동의를 철회하지 못했습니다.'), tone: 'error' })
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
      notify({ message: requestErrorMessage(error, 'Gmail AI 처리 기록을 삭제하지 못했습니다.'), tone: 'error' })
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

  const connectOAuth = async (provider: 'google' | 'microsoft' | 'todoist') => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
    if (catalogLoadingRef.current) return
    catalogLoadingRef.current = true
    setCatalogLoading(true)
    try {
      const native = Capacitor.isNativePlatform()
      const authorizationUrl = await startOAuthConnection(
        supabase,
        provider,
        native
          ? 'com.resq.medical://integration/callback'
          : `${window.location.origin}${window.location.pathname}`,
      )
      if (native) await Browser.open({ url: authorizationUrl })
      else window.location.assign(authorizationUrl)
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, `${LABEL[provider]} 연결을 시작하지 못했습니다.`),
        tone: 'error',
      })
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }

  const syncProvider = async (
    provider: SyncableProvider,
    options: { automatic?: boolean } = {},
  ) => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
    if (!connection(provider) || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setSyncingProvider(provider)
    setMessage(`${options.automatic ? '자동으로 ' : ''}${LABEL[provider]} 일정과 할 일을 동기화하는 중…`)
    try {
      const result = await syncExternalIntegration(supabase, provider)
      setMessage(formatSyncResult(LABEL[provider], result))
      setLastSyncSummary({
        provider: LABEL[provider],
        result,
        automatic: Boolean(options.automatic),
        completedAt: new Date().toISOString(),
      })
      onExternalDataChanged()
      await reloadIntegrationState()
      if (!options.automatic) {
        notify({ message: `${LABEL[provider]} 동기화를 완료했습니다.`, tone: 'success' })
      }
    } catch (error) {
      console.error(error)
      const failure = requestErrorMessage(error, `${LABEL[provider]} 동기화에 실패했습니다.`)
      setMessage(failure)
      await reloadIntegrationState().catch(() => {})
      notify({
        message: failure,
        tone: 'error',
        action: { label: '재시도', onClick: () => { void syncProvider(provider) } },
      })
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setSyncingProvider(null)
    }
  }

  const refreshProviderSources = async (
    provider: 'google' | 'microsoft' | 'todoist',
  ) => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
    if (!connection(provider) || catalogLoadingRef.current || syncingRef.current) return
    catalogLoadingRef.current = true
    setCatalogLoading(true)
    setMessage(`${LABEL[provider]} 캘린더와 목록을 확인하는 중…`)
    try {
      const result = await discoverExternalSources(supabase, provider)
      const next = await reloadIntegrationState()
      const discovered = next.sources.filter((source) => source.provider === provider).length
      setMessage(`${LABEL[provider]}에서 ${discovered}개 목록을 찾았습니다. 가져올 목록과 방식을 선택해주세요.`)
      notify({
        message: `${LABEL[provider]} 목록 ${discovered || result.sources}개를 확인했습니다.`,
        tone: 'success',
      })
    } catch (error) {
      console.error(error)
      const failure = requestErrorMessage(error, `${LABEL[provider]} 목록을 확인하지 못했습니다.`)
      setMessage(failure)
      await reloadIntegrationState().catch(() => {})
      notify({
        message: failure,
        tone: 'error',
        action: {
          label: '재시도',
          onClick: () => { void refreshProviderSources(provider) },
        },
      })
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }

  useEffect(() => {
    if (!online || !connections.length || catalogLoading || syncingRef.current) return
    const eligible = staleAutoSyncConnections(connections)
    const pending = eligible.filter((item) => {
      const attemptKey = `${item.id}:${item.last_synced_at ?? 'never'}`
      if (autoSyncAttemptedRef.current.has(attemptKey)) return false
      autoSyncAttemptedRef.current.add(attemptKey)
      return true
    })
    if (!pending.length) return
    void (async () => {
      for (const item of pending) {
        await syncProvider(item.provider as SyncableProvider, { automatic: true })
      }
    })()
    // Connections are the server-owned source of truth for stale auto-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogLoading, connections, online])

  const disconnectProvider = async (provider: SyncableProvider) => {
    const target = connection(provider)
    if (!target) return
    try {
      await disconnectIntegration(supabase, target.id)
      setConnections((current) => current.filter((item) => item.id !== target.id))
      setSources((current) => current.filter((source) => source.connection_id !== target.id))
      onExternalDataChanged()
      notify({ message: `${LABEL[provider]} 연결을 해제했습니다.`, tone: 'success' })
    } catch (error) {
      console.error(error)
      notify({ message: requestErrorMessage(error, `${LABEL[provider]} 연결을 해제하지 못했습니다.`), tone: 'error' })
    }
  }

  const configureDirect = async (values: {
    provider: 'ics' | 'caldav'
    endpointUrl: string
    label?: string
    username?: string
    password?: string
  }) => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return false
    }
    if (catalogLoadingRef.current) return false
    catalogLoadingRef.current = true
    setCatalogLoading(true)
    try {
      await configureDirectIntegration(supabase, values)
      await reloadIntegrationState()
      notify({
        message: values.provider === 'ics' ? 'ICS 구독을 연결했습니다.' : 'CalDAV 계정을 연결했습니다.',
        tone: 'success',
      })
      return true
    } catch (error) {
      console.error(error)
      notify({ message: requestErrorMessage(error, '구독 연결을 저장하지 못했습니다.'), tone: 'error' })
      return false
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }

  const importIcs = async (file: File) => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
    if (catalogLoadingRef.current) return
    const acceptedType = file.type === ''
      || file.type === 'text/calendar'
      || file.type === 'application/ics'
    if (!acceptedType || !file.name.toLowerCase().endsWith('.ics')) {
      notify({ message: 'iCalendar(.ics) 파일만 가져올 수 있습니다.', tone: 'error' })
      return
    }
    if (file.size > 5_000_000) {
      notify({ message: 'ICS 파일은 최대 5MB까지 가져올 수 있습니다.', tone: 'error' })
      return
    }
    catalogLoadingRef.current = true
    setCatalogLoading(true)
    try {
      const result = await importICSFile(supabase, profile.id, file.name, await file.text())
      await reloadIntegrationState()
      onExternalDataChanged()
      notify({
        message: `ICS에서 일정 ${result.events}건·할 일 ${result.todos}건을 가져왔습니다.`,
        tone: 'success',
      })
    } catch (error) {
      console.error(error)
      notify({ message: requestErrorMessage(error, 'ICS 파일을 가져오지 못했습니다.'), tone: 'error' })
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }

  const toggleSource = async (source: IntegrationSource) => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
    if (sourcePendingRef.current.has(source.id)) return
    sourcePendingRef.current.add(source.id)
    setSourcePendingIds(new Set(sourcePendingRef.current))
    const selected = !source.selected
    setSources((current) => current.map((item) => item.id === source.id ? { ...item, selected } : item))
    try {
      await setIntegrationSourceSelected(supabase, source.id, selected)
    } catch (error) {
      setSources((current) => current.map((item) => item.id === source.id ? source : item))
      notify({ message: requestErrorMessage(error, '동기화 목록 선택을 저장하지 못했습니다.'), tone: 'error' })
    } finally {
      sourcePendingRef.current.delete(source.id)
      setSourcePendingIds(new Set(sourcePendingRef.current))
    }
  }

  const changeSourceMode = async (source: IntegrationSource, syncMode: IntegrationSyncMode) => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
    if (sourcePendingRef.current.has(source.id) || source.sync_mode === syncMode) return
    sourcePendingRef.current.add(source.id)
    setSourcePendingIds(new Set(sourcePendingRef.current))
    const previous = source.sync_mode
    setSources((current) => current.map((item) => item.id === source.id ? { ...item, sync_mode: syncMode } : item))
    try {
      await setIntegrationSourceMode(supabase, source.id, syncMode)
    } catch (error) {
      setSources((current) => current.map((item) => item.id === source.id ? { ...item, sync_mode: previous } : item))
      notify({ message: requestErrorMessage(error, '동기화 모드를 저장하지 못했습니다.'), tone: 'error' })
    } finally {
      sourcePendingRef.current.delete(source.id)
      setSourcePendingIds(new Set(sourcePendingRef.current))
    }
  }

  const connectDevice = async () => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
    if (!nativeDeviceAvailable || catalogLoadingRef.current) return
    catalogLoadingRef.current = true
    setCatalogLoading(true)
    try {
      const result = await connectDeviceCalendar(supabase, profile.id)
      setSources((current) => [
        ...current.filter((source) => source.provider !== result.permissions.platform),
        ...result.sources,
      ])
      notify({ message: '기기 캘린더 접근이 연결되었습니다.', tone: 'success' })
    } catch (error) {
      notify({ message: requestErrorMessage(error, '기기 캘린더 접근을 연결하지 못했습니다.'), tone: 'error' })
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }

  const syncDevice = async () => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
    if (!nativeDeviceProvider || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setSyncingProvider(nativeDeviceProvider)
    try {
      let activeSources = deviceSources
      if (!activeSources.length) {
        const result = await connectDeviceCalendar(supabase, profile.id)
        activeSources = result.sources
      }
      if (!activeSources.some((source) => source.selected)) {
        notify({ message: '동기화할 기기 목록을 선택해주세요.', tone: 'warning' })
        return
      }
      const result = await syncDeviceCalendar(supabase, profile.id, activeSources)
      setMessage(formatSyncResult('기기', result))
      setLastSyncSummary({
        provider: '기기',
        result,
        automatic: false,
        completedAt: new Date().toISOString(),
      })
      onExternalDataChanged()
      await reloadIntegrationState()
      notify({ message: '기기 일정 동기화를 완료했습니다.', tone: 'success' })
    } catch (error) {
      notify({ message: requestErrorMessage(error, '기기 일정 동기화에 실패했습니다.'), tone: 'error' })
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setSyncingProvider(null)
    }
  }

  const downloadIcs = () => {
    const anchor = document.createElement('a')
    anchor.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildICS(events, todos))}`
    anchor.download = 'resq.ics'
    anchor.click()
  }

  const scanGmail = async () => {
    if (!online) {
      notify({ message: '인터넷 연결을 확인한 뒤 다시 시도해주세요.', tone: 'warning' })
      return
    }
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
      if (!emails.length) {
        setMessage('최근 2주 메일에서 일정 후보를 찾지 못했습니다')
        return
      }
      const candidates = await requestEventExtraction(supabase, emails, profile.specialty)
      setExtracted(candidates)
      refreshAudits()
      if (!candidates.length) setMessage('메일에서 일정을 찾지 못했습니다')
    } catch (error) {
      const failure = requestErrorMessage(error, '메일 스캔에 실패했습니다')
      setMessage(failure)
      notify({ message: failure, tone: 'error', action: { label: '재시도', onClick: () => { void scanGmail() } } })
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
    } finally {
      addingExtractedRef.current = false
      setAddingExtracted(false)
    }
  }

  const feedUrl = profile.ics_token
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${profile.ics_token}`
    : null

  return {
    capabilities,
    connections,
    allSources: sources,
    googleConnected: Boolean(googleConnection),
    googleAccountLabel: googleConnection?.account_email ?? googleConnection?.account_label ?? null,
    gmailConnected: Boolean(providerToken),
    microsoftConnected: Boolean(microsoftConnection),
    microsoftAccountLabel: microsoftConnection?.account_email ?? microsoftConnection?.account_label ?? null,
    todoistConnected: Boolean(todoistConnection),
    todoistAccountLabel: todoistConnection?.account_email ?? todoistConnection?.account_label ?? null,
    icsConnected: Boolean(icsConnection),
    caldavConnected: Boolean(caldavConnection),
    googleSources: sourcesFor('google'),
    microsoftSources: sourcesFor('microsoft'),
    todoistSources: sourcesFor('todoist'),
    icsSources: sourcesFor('ics'),
    caldavSources: sourcesFor('caldav'),
    deviceSources,
    nativeDeviceAvailable,
    nativeDeviceProvider,
    catalogLoading,
    sourcePendingIds,
    syncing,
    syncingProvider,
    lastSyncSummary,
    scanning,
    message,
    extracted,
    addingExtracted,
    gmailConsentGranted,
    consentBusy,
    audits,
    deletingAudits,
    feedUrl,
    connectGoogle: () => connectOAuth('google'),
    connectMicrosoft: () => connectOAuth('microsoft'),
    connectTodoist: () => connectOAuth('todoist'),
    syncGoogle: () => syncProvider('google'),
    refreshGoogleCatalog: () => refreshProviderSources('google'),
    refreshMicrosoftCatalog: () => refreshProviderSources('microsoft'),
    refreshTodoistCatalog: () => refreshProviderSources('todoist'),
    syncMicrosoft: () => syncProvider('microsoft'),
    syncTodoist: () => syncProvider('todoist'),
    syncIcsFeed: () => syncProvider('ics'),
    syncCalDav: () => syncProvider('caldav'),
    disconnectGoogle: () => disconnectProvider('google'),
    disconnectMicrosoft: () => disconnectProvider('microsoft'),
    disconnectTodoist: () => disconnectProvider('todoist'),
    disconnectIcs: () => disconnectProvider('ics'),
    disconnectCalDav: () => disconnectProvider('caldav'),
    configureDirect,
    importIcs,
    toggleSource,
    changeSourceMode,
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
