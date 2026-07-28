import { PageIntro } from '../components/PageIntro'
import { SyncPanel } from '../components/sections/SyncPanel'
import { useGoogleIntegration } from '../home/hooks/useGoogleIntegration'
import { useSchedule } from '../home/hooks/useSchedule'
import { useTodos } from '../home/hooks/useTodos'
import type { Profile } from '../lib/profile'

export function IntegrationsPage({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}) {
  const todos = useTodos({ profile, onProfileChange })
  const schedule = useSchedule(profile.id)
  const integrations = useGoogleIntegration({
    profile,
    onProfileChange,
    events: schedule.events,
    todos: todos.todos,
    onAddEvent: schedule.add,
    onExternalDataChanged: () => {
      schedule.refresh()
      todos.refresh()
    },
  })

  return (
    <div className="mx-auto max-w-[1300px] px-5 py-10 sm:px-8 sm:py-14">
      <PageIntro
        eyebrow="Connection Hub"
        title="외부 앱 연동"
        description="Google, Outlook, Todoist, Apple·Galaxy 기기 일정과 ICS·CalDAV를 연결합니다. 목록마다 읽기 전용 또는 양방향 모드를 선택할 수 있습니다."
      />
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
  )
}
