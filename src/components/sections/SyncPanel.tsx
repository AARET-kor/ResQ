import { useState, type ChangeEvent, type FormEvent } from 'react'
import { LiquidGlass } from '../LiquidGlass'
import { EVENT_KINDS } from '../../lib/events'
import type { ExtractedEvent } from '../../lib/gmail'
import type { GmailAuditEvent } from '../../lib/privacy'
import { GmailConsentDialog } from '../privacy/GmailConsentDialog'
import { PrivacyPolicyModal } from '../privacy/PrivacyPolicyModal'
import type {
  IntegrationCapabilities,
  IntegrationSource,
  IntegrationSyncMode,
} from '../../lib/integrations'

function SourceList({
  sources,
  onToggle,
  onModeChange,
}: {
  sources: IntegrationSource[]
  onToggle?: (source: IntegrationSource) => void
  onModeChange?: (source: IntegrationSource, mode: IntegrationSyncMode) => void
}) {
  if (sources.length === 0) return null
  const calendars = sources.filter((source) => source.resource_type === 'calendar')
  const taskLists = sources.filter((source) => source.resource_type === 'task_list')
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[
        { label: '캘린더', items: calendars },
        { label: '할 일 목록', items: taskLists },
      ].map((group) => group.items.length > 0 && (
        <fieldset key={group.label} className="rounded-md border border-cream/10 p-2">
          <legend className="px-1 font-sans text-xs uppercase text-cream/65">
            {group.label}
          </legend>
          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {group.items.map((source) => (
              <label
                key={source.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 font-sans text-sm text-cream/75 hover:bg-cream/5"
              >
                <input
                  type="checkbox"
                  checked={source.selected}
                  onChange={() => onToggle?.(source)}
                />
                {source.color && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: source.color }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{source.name}</span>
                <select
                  aria-label={`${source.name} 동기화 모드`}
                  value={source.can_write ? source.sync_mode : 'read_only'}
                  disabled={!source.can_write}
                  onChange={(event) => onModeChange?.(
                    source,
                    event.target.value as IntegrationSyncMode,
                  )}
                  className="rounded border border-cream/10 bg-bg px-1 py-0.5 font-sans text-xs text-cream/75 disabled:opacity-50"
                >
                  <option value="read_only">읽기</option>
                  <option value="two_way">양방향</option>
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

/**
 * External calendar integration card: push this month to Google Calendar,
 * download/subscribe to an .ics feed for Apple/Galaxy, and scan Gmail for
 * candidate schedule events awaiting review.
 */
export function SyncPanel({
  capabilities = {
    google: false,
    microsoft: false,
    todoist: false,
    ics: true,
    caldav: false,
  },
  googleConnected,
  googleAccountLabel,
  gmailConnected = false,
  microsoftConnected = false,
  microsoftAccountLabel,
  todoistConnected = false,
  todoistAccountLabel,
  icsConnected = false,
  caldavConnected = false,
  googleSources = [],
  microsoftSources = [],
  todoistSources = [],
  icsSources = [],
  caldavSources = [],
  deviceSources = [],
  nativeDeviceAvailable = false,
  nativeDeviceProvider = null,
  catalogLoading = false,
  onConnectGoogle,
  onRefreshGoogleSources,
  onToggleSource,
  onChangeSourceMode,
  onDisconnectGoogle,
  onReconnectGoogle,
  onSyncMonth,
  onConnectMicrosoft,
  onSyncMicrosoft,
  onDisconnectMicrosoft,
  onConnectTodoist,
  onSyncTodoist,
  onDisconnectTodoist,
  onSyncIcsFeed,
  onSyncCalDav,
  onDisconnectIcs,
  onDisconnectCalDav,
  onConfigureDirect,
  onImportIcs,
  onConnectDevice,
  onSyncDevice,
  syncing = false,
  syncingProvider = null,
  syncMessage,
  onDownloadIcs,
  feedUrl,
  onScanGmail,
  scanning,
  extracted,
  addingExtracted = false,
  onAddExtracted,
  onDismissExtracted,
  gmailConsentGranted = false,
  consentBusy = false,
  audits = [],
  deletingAudits = false,
  onGrantConsent,
  onRevokeConsent,
  onDeleteAudits,
}: {
  capabilities?: IntegrationCapabilities
  googleConnected: boolean
  googleAccountLabel?: string | null
  gmailConnected?: boolean
  microsoftConnected?: boolean
  microsoftAccountLabel?: string | null
  todoistConnected?: boolean
  todoistAccountLabel?: string | null
  icsConnected?: boolean
  caldavConnected?: boolean
  googleSources?: IntegrationSource[]
  microsoftSources?: IntegrationSource[]
  todoistSources?: IntegrationSource[]
  icsSources?: IntegrationSource[]
  caldavSources?: IntegrationSource[]
  deviceSources?: IntegrationSource[]
  nativeDeviceAvailable?: boolean
  nativeDeviceProvider?: 'apple' | 'android' | null
  catalogLoading?: boolean
  onConnectGoogle?: () => void
  onRefreshGoogleSources?: () => void
  onToggleSource?: (source: IntegrationSource) => void
  onChangeSourceMode?: (source: IntegrationSource, mode: IntegrationSyncMode) => void
  onDisconnectGoogle?: () => void
  onReconnectGoogle?: () => void
  onSyncMonth: () => void
  onConnectMicrosoft?: () => void
  onSyncMicrosoft?: () => void
  onDisconnectMicrosoft?: () => void
  onConnectTodoist?: () => void
  onSyncTodoist?: () => void
  onDisconnectTodoist?: () => void
  onSyncIcsFeed?: () => void
  onSyncCalDav?: () => void
  onDisconnectIcs?: () => void
  onDisconnectCalDav?: () => void
  onConfigureDirect?: (values: {
    provider: 'ics' | 'caldav'
    endpointUrl: string
    label?: string
    username?: string
    password?: string
  }) => Promise<boolean>
  onImportIcs?: (file: File) => void
  onConnectDevice?: () => void
  onSyncDevice?: () => void
  syncing?: boolean
  syncingProvider?: 'google' | 'microsoft' | 'todoist' | 'ics' | 'caldav' | 'apple' | 'android' | null
  syncMessage: string | null
  onDownloadIcs: () => void
  feedUrl: string | null
  onScanGmail: () => void
  scanning: boolean
  extracted: ExtractedEvent[]
  addingExtracted?: boolean
  onAddExtracted: (ev: ExtractedEvent) => void
  onDismissExtracted: () => void
  gmailConsentGranted?: boolean
  consentBusy?: boolean
  audits?: GmailAuditEvent[]
  deletingAudits?: boolean
  onGrantConsent?: () => Promise<boolean>
  onRevokeConsent?: () => void
  onDeleteAudits?: () => void
}) {
  const [consentOpen, setConsentOpen] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [icsUrl, setIcsUrl] = useState('')
  const [caldavUrl, setCaldavUrl] = useState('')
  const [caldavUsername, setCaldavUsername] = useState('')
  const [caldavPassword, setCaldavPassword] = useState('')

  const configure = async (
    event: FormEvent,
    provider: 'ics' | 'caldav',
  ) => {
    event.preventDefault()
    if (!onConfigureDirect) return
    const succeeded = await onConfigureDirect(provider === 'ics'
      ? { provider, endpointUrl: icsUrl }
      : {
          provider,
          endpointUrl: caldavUrl,
          username: caldavUsername,
          password: caldavPassword,
        })
    if (!succeeded) return
    if (provider === 'ics') setIcsUrl('')
    else {
      setCaldavUrl('')
      setCaldavUsername('')
      setCaldavPassword('')
    }
  }

  const importIcs = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onImportIcs?.(file)
    event.target.value = ''
  }

  return (
    <>
    <LiquidGlass className="rounded-[24px]">
      <div className="flex flex-col gap-4 p-6">
        <h3 className="font-grotesk text-2xl uppercase">외부 캘린더 연동</h3>

        {/* Google */}
        <div className="flex flex-col gap-2 rounded-md bg-cream/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-sans text-sm uppercase text-cream/70">
              Google Calendar + Tasks
            </span>
            {googleConnected && (
              <span className="rounded-full bg-neon/10 px-2 py-0.5 font-sans text-xs text-neon">
                연결됨
              </span>
            )}
          </div>
          {googleConnected ? (
            <>
              {googleAccountLabel && (
                <span className="font-sans text-sm text-cream/70">{googleAccountLabel}</span>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={onSyncMonth} disabled={syncing}
                  className="rounded-md bg-accent px-4 py-2 font-grotesk text-xs uppercase text-accentInk transition hover:opacity-90 disabled:opacity-50">
                  {syncingProvider === 'google' ? 'Google 동기화 중…' : '일정·할 일 양방향 동기화'}
                </button>
                <button onClick={onRefreshGoogleSources} disabled={catalogLoading || syncing}
                  className="rounded-md border border-cream/20 px-3 py-2 font-sans text-sm text-cream/70 transition hover:bg-cream/10 disabled:opacity-40">
                  {catalogLoading ? '목록 확인 중…' : '캘린더·목록 새로고침'}
                </button>
                <button onClick={onDisconnectGoogle} disabled={syncing}
                  className="font-sans text-sm text-cream/70 underline disabled:opacity-40">
                  연결 해제
                </button>
              </div>
              <SourceList
                sources={googleSources}
                onToggle={onToggleSource}
                onModeChange={onChangeSourceMode}
              />
              {googleSources.length === 0 && (
                <span className="font-sans text-sm text-cream/70">
                  목록 새로고침을 눌러 가져올 캘린더와 할 일 목록을 선택하세요.
                </span>
              )}
              <span className="font-sans text-sm leading-relaxed text-cream/65">
                선택한 일정은 최근 90일부터 앞으로 1년까지 통합합니다. 일정 메모와 이메일 본문은 동기화하지 않습니다.
              </span>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-sans text-xs text-cream/75">
                서버가 토큰을 안전하게 보관하고 자동 갱신합니다.
              </span>
              {capabilities.google ? (
                <button onClick={onConnectGoogle}
                  className="rounded-md border border-cream/30 px-3 py-1.5 font-grotesk text-sm uppercase text-cream hover:bg-cream/10">
                  Google Calendar·Tasks 연결
                </button>
              ) : (
                <span className="rounded-md border border-cream/15 px-3 py-1.5 font-sans text-sm text-muted">
                  관리자 OAuth 설정 대기
                </span>
              )}
            </div>
          )}
        </div>

        {/* Microsoft */}
        <div className="flex flex-col gap-2 rounded-md bg-cream/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-sans text-sm uppercase text-cream/70">
              Outlook Calendar + Microsoft To Do
            </span>
            {microsoftConnected && (
              <span className="rounded-full bg-sky-400/10 px-2 py-0.5 font-sans text-xs text-sky-700 dark:text-sky-300">
                연결됨
              </span>
            )}
          </div>
          {microsoftConnected ? (
            <>
              {microsoftAccountLabel && (
                <span className="font-sans text-sm text-cream/70">{microsoftAccountLabel}</span>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={onSyncMicrosoft} disabled={syncing}
                  className="rounded-md bg-sky-300 px-4 py-2 font-grotesk text-xs uppercase text-[#07111f] transition hover:opacity-90 disabled:opacity-50">
                  {syncingProvider === 'microsoft' ? 'Microsoft 동기화 중…' : 'Outlook·To Do 동기화'}
                </button>
                <button onClick={onDisconnectMicrosoft} disabled={syncing}
                  className="font-sans text-sm text-cream/65 underline disabled:opacity-40">
                  연결 해제
                </button>
              </div>
              <SourceList
                sources={microsoftSources}
                onToggle={onToggleSource}
                onModeChange={onChangeSourceMode}
              />
              <span className="font-sans text-sm text-cream/65">
                삼성 Reminder를 Microsoft To Do와 동기화하면 ResQ에서도 함께 볼 수 있습니다.
              </span>
            </>
          ) : capabilities.microsoft ? (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={onConnectMicrosoft} disabled={catalogLoading}
                className="rounded-md border border-sky-300/50 px-4 py-2 font-grotesk text-xs uppercase text-sky-700 transition hover:bg-sky-300/10 dark:text-sky-200 disabled:opacity-40">
                Microsoft 계정 연결
              </button>
              <span className="font-sans text-sm text-cream/65">
                Outlook 일정과 To Do·삼성 Reminder를 통합합니다.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button disabled
                className="rounded-md border border-cream/15 px-4 py-2 font-grotesk text-xs uppercase text-muted">
                관리자 설정 대기
              </button>
              <span className="font-sans text-sm text-cream/65">
                Microsoft Entra 앱 자격 증명을 등록하면 Outlook·To Do 연결이 활성화됩니다.
              </span>
            </div>
          )}
        </div>

        {/* Todoist */}
        <div className="flex flex-col gap-2 rounded-md bg-cream/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-sans text-sm uppercase text-cream/70">
              Todoist
            </span>
            {todoistConnected && (
              <span className="rounded-full bg-red-400/10 px-2 py-0.5 font-sans text-xs text-red-700 dark:text-red-300">
                연결됨
              </span>
            )}
          </div>
          {todoistConnected ? (
            <>
              {todoistAccountLabel && (
                <span className="font-sans text-sm text-cream/70">{todoistAccountLabel}</span>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={onSyncTodoist} disabled={syncing}
                  className="rounded-md bg-red-300 px-4 py-2 font-grotesk text-xs uppercase text-[#07111f] transition hover:opacity-90 disabled:opacity-50">
                  {syncingProvider === 'todoist' ? 'Todoist 동기화 중…' : 'Todoist 동기화'}
                </button>
                <button onClick={onDisconnectTodoist} disabled={syncing}
                  className="font-sans text-sm text-cream/65 underline disabled:opacity-40">
                  연결 해제
                </button>
              </div>
              <SourceList
                sources={todoistSources}
                onToggle={onToggleSource}
                onModeChange={onChangeSourceMode}
              />
            </>
          ) : capabilities.todoist ? (
            <button onClick={onConnectTodoist} disabled={catalogLoading}
              className="self-start rounded-md border border-red-300/50 px-4 py-2 font-grotesk text-xs uppercase text-red-700 transition hover:bg-red-300/10 dark:text-red-200 disabled:opacity-40">
              Todoist 계정 연결
            </button>
          ) : (
            <span className="font-sans text-sm text-cream/65">
              Todoist OAuth 앱 설정 후 활성화됩니다.
            </span>
          )}
        </div>

        {/* Apple / Galaxy */}
        <div className="flex flex-col gap-2 rounded-md bg-cream/5 px-4 py-3">
          <span className="font-sans text-sm uppercase text-cream/70">
            Apple Calendar · Reminders / 기기 캘린더
          </span>
          {nativeDeviceAvailable && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {deviceSources.length === 0 ? (
                  <button onClick={onConnectDevice} disabled={catalogLoading || syncing}
                    className="rounded-md bg-violet-300 px-4 py-2 font-grotesk text-xs uppercase text-[#07111f] transition hover:opacity-90 disabled:opacity-40">
                    {nativeDeviceProvider === 'apple'
                      ? 'Apple Calendar·Reminders 연결'
                      : '기기 캘린더 연결'}
                  </button>
                ) : (
                  <>
                    <button onClick={onSyncDevice} disabled={syncing}
                      className="rounded-md bg-violet-300 px-4 py-2 font-grotesk text-xs uppercase text-[#07111f] transition hover:opacity-90 disabled:opacity-40">
                      {syncingProvider === nativeDeviceProvider
                        ? '기기 동기화 중…'
                        : nativeDeviceProvider === 'apple'
                          ? 'Apple 일정·미리 알림 동기화'
                          : '기기 일정 동기화'}
                    </button>
                    <button onClick={onConnectDevice} disabled={catalogLoading || syncing}
                      className="font-sans text-sm text-cream/70 underline disabled:opacity-40">
                      권한·목록 새로고침
                    </button>
                  </>
                )}
              </div>
              <SourceList
                sources={deviceSources}
                onToggle={onToggleSource}
                onModeChange={onChangeSourceMode}
              />
              {nativeDeviceProvider === 'android' && (
                <span className="font-sans text-sm text-cream/65">
                  Android 표준 캘린더를 통합합니다. 삼성 Reminder는 Microsoft To Do 연결을 사용하세요.
                </span>
              )}
            </>
          )}
          <button onClick={onDownloadIcs}
            className="self-start rounded-md border border-cream/30 px-4 py-2 font-grotesk text-xs uppercase text-cream transition hover:bg-cream/10">
            읽기용 .ics 다운로드
          </button>
          {feedUrl && (
            <div className="flex flex-col gap-1">
              <code className="break-all rounded-md bg-surfaceRaised px-3 py-2 font-mono text-sm text-cream/80">
                {feedUrl}
              </code>
              <span className="font-sans text-sm text-cream/70">
                아이폰/갤럭시 캘린더 앱에서 '구독 캘린더 추가'에 붙여넣기
              </span>
            </div>
          )}
          {!nativeDeviceAvailable && (
            <span className="font-sans text-sm leading-relaxed text-cream/65">
              Apple Calendar·Reminders 및 기기에만 저장된 삼성 일정의 완전한 양방향 연동은 ResQ 모바일 앱에서 시스템 권한으로 제공됩니다.
            </span>
          )}
        </div>

        {/* ICS / CalDAV */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-md bg-cream/5 px-4 py-3">
            <span className="font-sans text-sm uppercase text-cream/70">ICS 가져오기·구독</span>
            <label className="cursor-pointer self-start rounded-md border border-cream/25 px-3 py-2 font-grotesk text-sm uppercase text-cream hover:bg-cream/10">
              .ics 파일 가져오기
              <input type="file" accept=".ics,text/calendar" onChange={importIcs} className="sr-only" />
            </label>
            {icsConnected ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <button onClick={onSyncIcsFeed} disabled={syncing}
                    className="rounded-md bg-amber-200 px-3 py-2 font-grotesk text-sm uppercase text-[#07111f] disabled:opacity-40">
                    {syncingProvider === 'ics' ? 'ICS 동기화 중…' : '구독 새로고침'}
                  </button>
                  <button onClick={onDisconnectIcs} disabled={syncing}
                    className="font-sans text-sm text-cream/65 underline disabled:opacity-40">
                    구독 해제
                  </button>
                </div>
                <SourceList
                  sources={icsSources}
                  onToggle={onToggleSource}
                  onModeChange={onChangeSourceMode}
                />
              </>
            ) : (
              <form onSubmit={(event) => { void configure(event, 'ics') }} className="flex gap-2">
                <input
                  type="url"
                  required
                  placeholder="https://…/calendar.ics"
                  value={icsUrl}
                  onChange={(event) => setIcsUrl(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-cream/15 bg-surfaceRaised/55 px-3 py-2 font-sans text-sm text-cream outline-none focus:border-neon/50"
                />
                <button disabled={catalogLoading}
                  className="rounded-md border border-amber-200/40 px-3 py-2 font-grotesk text-sm uppercase text-amber-900 dark:text-amber-100 disabled:opacity-40">
                  구독
                </button>
              </form>
            )}
          </div>
          <div className="flex flex-col gap-2 rounded-md bg-cream/5 px-4 py-3">
            <span className="font-sans text-sm uppercase text-cream/70">CalDAV</span>
            {caldavConnected ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <button onClick={onSyncCalDav} disabled={syncing}
                    className="rounded-md bg-violet-200 px-3 py-2 font-grotesk text-sm uppercase text-[#07111f] disabled:opacity-40">
                    {syncingProvider === 'caldav' ? 'CalDAV 동기화 중…' : 'CalDAV 동기화'}
                  </button>
                  <button onClick={onDisconnectCalDav} disabled={syncing}
                    className="font-sans text-sm text-cream/65 underline disabled:opacity-40">
                    연결 해제
                  </button>
                </div>
                <SourceList
                  sources={caldavSources}
                  onToggle={onToggleSource}
                  onModeChange={onChangeSourceMode}
                />
              </>
            ) : capabilities.caldav ? (
              <form onSubmit={(event) => { void configure(event, 'caldav') }} className="grid gap-2">
                <input type="url" required placeholder="CalDAV calendar home URL"
                  value={caldavUrl} onChange={(event) => setCaldavUrl(event.target.value)}
                  className="rounded-md border border-cream/15 bg-surfaceRaised/55 px-3 py-2 font-sans text-sm text-cream outline-none focus:border-violet-300/50" />
                <div className="grid grid-cols-2 gap-2">
                  <input required placeholder="사용자 이름" autoComplete="username"
                    value={caldavUsername} onChange={(event) => setCaldavUsername(event.target.value)}
                    className="min-w-0 rounded-md border border-cream/15 bg-surfaceRaised/55 px-3 py-2 font-sans text-sm text-cream outline-none" />
                  <input type="password" required placeholder="앱 비밀번호" autoComplete="current-password"
                    value={caldavPassword} onChange={(event) => setCaldavPassword(event.target.value)}
                    className="min-w-0 rounded-md border border-cream/15 bg-surfaceRaised/55 px-3 py-2 font-sans text-sm text-cream outline-none" />
                </div>
                <button disabled={catalogLoading}
                  className="justify-self-start rounded-md border border-violet-200/40 px-3 py-2 font-grotesk text-sm uppercase text-violet-800 dark:text-violet-100 disabled:opacity-40">
                  CalDAV 연결
                </button>
              </form>
            ) : (
              <span className="font-sans text-sm text-cream/65">보안 키 설정 후 활성화됩니다.</span>
            )}
            <span className="font-sans text-xs leading-relaxed text-muted">
              공개 HTTPS 서버만 허용하며 주소와 앱 비밀번호는 브라우저에 저장하지 않습니다.
            </span>
          </div>
        </div>

        {/* Gmail */}
        <div className="flex flex-col gap-2 rounded-md bg-cream/5 px-4 py-3">
          <span className="font-sans text-sm uppercase text-cream/70">Gmail</span>
          {gmailConnected ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => gmailConsentGranted ? onScanGmail() : setConsentOpen(true)}
                disabled={scanning || consentBusy}
                className="rounded-md bg-accent px-4 py-2 font-grotesk text-xs uppercase text-accentInk transition hover:opacity-90 disabled:opacity-50">
                {gmailConsentGranted ? 'Gmail에서 일정 가져오기' : '동의 후 Gmail 사용'}
              </button>
              <button type="button" onClick={() => setPolicyOpen(true)}
                className="font-sans text-sm text-cream/75 underline">
                개인정보 처리 안내
              </button>
              {gmailConsentGranted && (
                <button type="button" onClick={onRevokeConsent} disabled={consentBusy}
                  className="font-sans text-sm text-amber-800 underline dark:text-amber-300/80 disabled:opacity-40">
                  동의 철회
                </button>
              )}
            </div>
          ) : (
            <button onClick={onReconnectGoogle}
              className="self-start rounded-md border border-cream/25 px-3 py-2 font-grotesk text-sm uppercase text-cream hover:bg-cream/10">
              Gmail 권한 다시 연결
            </button>
          )}
          <span className="font-sans text-sm leading-relaxed text-amber-900/80 dark:text-amber-200/70">
            환자정보가 포함된 메일에는 사용하지 마세요. 이메일 원문은 ResQ DB에 저장하지 않습니다.
          </span>
          {scanning && <span className="font-sans text-xs text-cream/75">메일을 읽는 중…</span>}
        </div>

        {syncMessage && (
          <p className="font-sans text-xs text-cream/70">{syncMessage}</p>
        )}

        {/* Extracted review list */}
        {extracted.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md bg-cream/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-sans text-sm uppercase text-cream/70">가져온 일정 후보</span>
              <button onClick={onDismissExtracted}
                className="font-sans text-sm uppercase text-cream/65 transition hover:text-cream">
                닫기
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {extracted.map((ev, i) => (
                <li key={i} className="flex items-center gap-3 rounded-md bg-cream/5 px-3 py-2">
                  <span className="font-sans text-sm uppercase text-cream/75">
                    {ev.starts_at.slice(5, 10)} {ev.starts_at.slice(11, 16)}
                  </span>
                  <span className="flex-1 font-sans text-sm">{ev.title}</span>
                  <span className="font-sans text-sm uppercase text-cream/70">{EVENT_KINDS[ev.kind]}</span>
                  <button onClick={() => onAddExtracted(ev)}
                    disabled={addingExtracted}
                    className="rounded-md border border-cream/30 px-3 py-1 font-grotesk text-sm uppercase text-cream transition hover:bg-cream/10 disabled:cursor-wait disabled:opacity-50">
                    {addingExtracted ? '추가 중…' : '일정에 추가'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </LiquidGlass>
    {consentOpen && onGrantConsent && (
      <GmailConsentDialog
        busy={consentBusy}
        onConfirm={onGrantConsent}
        onShowPolicy={() => setPolicyOpen(true)}
        onClose={() => setConsentOpen(false)}
      />
    )}
    {policyOpen && (
      <PrivacyPolicyModal
        audits={audits}
        deleting={deletingAudits}
        onDeleteAudits={() => onDeleteAudits?.()}
        onClose={() => setPolicyOpen(false)}
      />
    )}
    </>
  )
}
