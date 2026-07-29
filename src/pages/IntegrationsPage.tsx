import { useEffect, useState } from 'react'
import { PageIntro } from '../components/PageIntro'
import { SyncPanel } from '../components/sections/SyncPanel'
import { IntegrationGuide } from '../components/integrations/IntegrationGuide'
import { useGoogleIntegration } from '../home/hooks/useGoogleIntegration'
import { useSchedule } from '../home/hooks/useSchedule'
import { useTodos } from '../home/hooks/useTodos'
import type { Profile } from '../lib/profile'

function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

export function IntegrationsPage({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const online = useOnlineStatus()
  const todos = useTodos({ profile, onProfileChange })
  const schedule = useSchedule(profile.id)
  const integrations = useGoogleIntegration({
    profile,
    onProfileChange,
    events: schedule.events,
    todos: todos.todos,
    online,
    onAddEvent: schedule.add,
    onExternalDataChanged: () => {
      schedule.refresh()
      todos.refresh()
    },
  })

  const openAdvanced = () => {
    setAdvancedOpen(true)
    window.requestAnimationFrame(() => {
      document.getElementById('advanced-integrations')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  return (
    <div className="mx-auto max-w-[1300px] px-5 py-10 sm:px-8 sm:py-14">
      <PageIntro
        eyebrow="Connection Hub"
        title="외부 앱 연동"
        description="지금 쓰는 앱을 고르면 ResQ가 계정 연결부터 첫 동기화까지 한 단계씩 안내합니다. 무엇이 연결됐고 다음에 무엇을 해야 하는지도 이 화면에서 바로 확인할 수 있습니다."
      />
      <IntegrationGuide
        capabilities={integrations.capabilities}
        connections={integrations.connections}
        googleSources={integrations.googleSources}
        microsoftSources={integrations.microsoftSources}
        todoistSources={integrations.todoistSources}
        deviceSources={integrations.deviceSources}
        nativeDeviceAvailable={integrations.nativeDeviceAvailable}
        nativeDeviceProvider={integrations.nativeDeviceProvider}
        sourcePendingIds={integrations.sourcePendingIds}
        online={online}
        catalogLoading={integrations.catalogLoading}
        syncing={integrations.syncing}
        syncingProvider={integrations.syncingProvider}
        syncMessage={integrations.message}
        lastSyncSummary={integrations.lastSyncSummary}
        onConnectGoogle={integrations.connectGoogle}
        onConnectMicrosoft={integrations.connectMicrosoft}
        onConnectTodoist={integrations.connectTodoist}
        onRefreshGoogleSources={integrations.refreshGoogleCatalog}
        onRefreshMicrosoftSources={integrations.refreshMicrosoftCatalog}
        onRefreshTodoistSources={integrations.refreshTodoistCatalog}
        onSyncGoogle={integrations.syncGoogle}
        onSyncMicrosoft={integrations.syncMicrosoft}
        onSyncTodoist={integrations.syncTodoist}
        onConnectDevice={integrations.connectDevice}
        onSyncDevice={integrations.syncDevice}
        onToggleSource={integrations.toggleSource}
        onChangeSourceMode={integrations.changeSourceMode}
        onOpenAdvanced={openAdvanced}
      />

      <details
        id="advanced-integrations"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        className="mt-10 scroll-mt-24 rounded-[24px] border border-line/70 bg-surface p-3 shadow-sm sm:p-4"
      >
        <summary className="cursor-pointer rounded-xl px-3 py-3 font-grotesk text-sm uppercase text-cream/65 transition hover:bg-cream/5 hover:text-cream">
          세부 설정 · 복구 도구
          <span className="ml-3 font-sans text-xs normal-case text-muted">
            ICS · CalDAV · Gmail · 연결 해제
          </span>
        </summary>
        <div className="mt-3">
          <SyncPanel
            capabilities={integrations.capabilities}
            googleConnected={integrations.googleConnected}
            googleAccountLabel={integrations.googleAccountLabel}
            gmailConnected={integrations.gmailConnected}
            microsoftConnected={integrations.microsoftConnected}
            microsoftAccountLabel={integrations.microsoftAccountLabel}
            todoistConnected={integrations.todoistConnected}
            todoistAccountLabel={integrations.todoistAccountLabel}
            icsConnected={integrations.icsConnected}
            caldavConnected={integrations.caldavConnected}
            googleSources={integrations.googleSources}
            microsoftSources={integrations.microsoftSources}
            todoistSources={integrations.todoistSources}
            icsSources={integrations.icsSources}
            caldavSources={integrations.caldavSources}
            deviceSources={integrations.deviceSources}
            nativeDeviceAvailable={integrations.nativeDeviceAvailable}
            nativeDeviceProvider={integrations.nativeDeviceProvider}
            catalogLoading={integrations.catalogLoading}
            onConnectGoogle={integrations.connectGoogle}
            onRefreshGoogleSources={integrations.refreshGoogleCatalog}
            onToggleSource={integrations.toggleSource}
            onChangeSourceMode={integrations.changeSourceMode}
            onDisconnectGoogle={integrations.disconnectGoogle}
            onReconnectGoogle={integrations.reconnectGoogle}
            onSyncMonth={integrations.syncGoogle}
            onConnectMicrosoft={integrations.connectMicrosoft}
            onSyncMicrosoft={integrations.syncMicrosoft}
            onDisconnectMicrosoft={integrations.disconnectMicrosoft}
            onConnectTodoist={integrations.connectTodoist}
            onSyncTodoist={integrations.syncTodoist}
            onDisconnectTodoist={integrations.disconnectTodoist}
            onSyncIcsFeed={integrations.syncIcsFeed}
            onSyncCalDav={integrations.syncCalDav}
            onDisconnectIcs={integrations.disconnectIcs}
            onDisconnectCalDav={integrations.disconnectCalDav}
            onConfigureDirect={integrations.configureDirect}
            onImportIcs={integrations.importIcs}
            onConnectDevice={integrations.connectDevice}
            onSyncDevice={integrations.syncDevice}
            syncing={integrations.syncing}
            syncingProvider={integrations.syncingProvider}
            syncMessage={integrations.message}
            onDownloadIcs={integrations.downloadIcs}
            feedUrl={integrations.feedUrl}
            onScanGmail={integrations.scanGmail}
            scanning={integrations.scanning}
            extracted={integrations.extracted}
            addingExtracted={integrations.addingExtracted}
            onAddExtracted={integrations.addExtracted}
            onDismissExtracted={integrations.dismissExtracted}
            gmailConsentGranted={integrations.gmailConsentGranted}
            consentBusy={integrations.consentBusy}
            audits={integrations.audits}
            deletingAudits={integrations.deletingAudits}
            onGrantConsent={integrations.grantConsent}
            onRevokeConsent={integrations.revokeConsent}
            onDeleteAudits={integrations.deleteAudits}
          />
        </div>
      </details>
    </div>
  )
}
