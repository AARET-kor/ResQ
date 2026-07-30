import { useState } from 'react'
import {
  ArrowLeftRight,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Cloud,
  Download,
  ExternalLink,
  HardDriveDownload,
  ListChecks,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  WifiOff,
} from 'lucide-react'
import { LiquidGlass } from '../LiquidGlass'
import type {
  IntegrationCapabilities,
  IntegrationConnection,
  IntegrationProvider,
  IntegrationSource,
  IntegrationSyncMode,
  IntegrationSyncResult,
} from '../../lib/integrations'
import { IntegrationSourcePicker } from './IntegrationSourcePicker'

export type IntegrationGuideKey =
  | 'google'
  | 'apple'
  | 'galaxy'
  | 'microsoft'
  | 'todoist'
  | 'other'

interface LastSyncSummary {
  provider: string
  result: IntegrationSyncResult
  automatic: boolean
  completedAt: string
}

const GUIDE_OPTIONS: Array<{
  key: IntegrationGuideKey
  label: string
  description: string
  accent: string
}> = [
  {
    key: 'google',
    label: 'Google',
    description: 'Calendar · Tasks',
    accent: '#6FFF00',
  },
  {
    key: 'apple',
    label: 'iPhone',
    description: 'Calendar · Reminders',
    accent: '#B9A2FF',
  },
  {
    key: 'galaxy',
    label: 'Galaxy',
    description: 'Calendar · Reminder',
    accent: '#69C7FF',
  },
  {
    key: 'microsoft',
    label: 'Outlook',
    description: 'Calendar · To Do',
    accent: '#5CB8FF',
  },
  {
    key: 'todoist',
    label: 'Todoist',
    description: 'Projects · Tasks',
    accent: '#FF8A8A',
  },
  {
    key: 'other',
    label: '기타 앱',
    description: 'ICS · CalDAV',
    accent: '#FFCE73',
  },
]

function formatSyncTime(value: string | null | undefined): string {
  if (!value) return '아직 동기화 전'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '동기화 기록 있음'
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000))
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function SetupStep({
  number,
  title,
  description,
  complete,
  blocked = false,
  children,
}: {
  number: number
  title: string
  description: string
  complete: boolean
  blocked?: boolean
  children?: React.ReactNode
}) {
  return (
    <li className={`relative grid grid-cols-[36px_1fr] gap-3 pb-7 last:pb-0 ${
      blocked ? 'opacity-45' : ''
    }`}>
      <div className="relative flex justify-center">
        <span className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border font-grotesk text-xs ${
          complete
            ? 'border-accent bg-accent text-accentInk'
            : 'border-line/70 bg-surface text-muted'
        }`}>
          {complete ? <Check size={15} strokeWidth={3} /> : number}
        </span>
        {number < 4 && (
          <span className={`absolute bottom-[-28px] top-8 w-px ${
            complete ? 'bg-neon/40' : 'bg-cream/10'
          }`} />
        )}
      </div>
      <div className="pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-grotesk text-base uppercase text-cream">{title}</h3>
          {complete && (
            <span className="rounded-full bg-neon/10 px-2 py-0.5 font-sans text-xs text-neon">
              완료
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl font-sans text-sm leading-relaxed text-cream/65">
          {description}
        </p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  )
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
  busy = false,
  tone = 'neon',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  tone?: 'neon' | 'sky' | 'red' | 'violet'
}) {
  const toneClass = {
    neon: 'bg-accent text-accentInk',
    sky: 'bg-sky-300 text-[#07111f]',
    red: 'bg-red-300 text-[#07111f]',
    violet: 'bg-violet-300 text-[#07111f]',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 font-grotesk text-xs uppercase transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {busy && <LoaderCircle size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

function OAuthSetup({
  label,
  provider,
  tone,
  capability,
  connection,
  sources,
  sourcePendingIds,
  online,
  syncing,
  syncingProvider,
  catalogLoading,
  onConnect,
  onFindSources,
  onSync,
  onToggleSource,
  onChangeSourceMode,
}: {
  label: string
  provider: 'google' | 'microsoft' | 'todoist'
  tone: 'neon' | 'sky' | 'red'
  capability: boolean
  connection: IntegrationConnection | null
  sources: IntegrationSource[]
  sourcePendingIds: ReadonlySet<string>
  online: boolean
  syncing: boolean
  syncingProvider: IntegrationProvider | null
  catalogLoading: boolean
  onConnect?: () => void
  onFindSources?: () => void
  onSync?: () => void
  onToggleSource?: (source: IntegrationSource) => void
  onChangeSourceMode?: (source: IntegrationSource, mode: IntegrationSyncMode) => void
}) {
  const connected = Boolean(connection)
  const selected = sources.filter((source) => source.selected)
  const syncedAt = connection?.last_synced_at
    ?? sources.map((source) => source.last_synced_at).filter(Boolean).sort().at(-1)
    ?? null
  const providerBusy = syncing && syncingProvider === provider

  return (
    <ol>
      <SetupStep
        number={1}
        title={`${label} 계정 연결`}
        description="ResQ 서버가 OAuth 토큰을 암호화해 보관하고 만료 전에 자동 갱신합니다."
        complete={connected}
      >
        {connected ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-cream/10 bg-cream/5 px-3 py-2 font-sans text-sm text-cream/65">
              {connection?.account_email ?? connection?.account_label ?? `${label} 계정`}
            </span>
            {connection?.last_error && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-400/10 px-3 py-2 font-sans text-xs text-red-700 dark:text-red-200">
                <TriangleAlert size={12} />
                {connection.last_error}
              </span>
            )}
          </div>
        ) : capability ? (
          <PrimaryButton
            tone={tone}
            onClick={onConnect}
            disabled={!online || catalogLoading}
            busy={catalogLoading}
          >
            {label} 계정 연결
          </PrimaryButton>
        ) : (
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.055] px-4 py-3">
            <p className="font-sans text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/70">
              관리자 OAuth 설정이 아직 완료되지 않았습니다. 앱 설정에 {label} 클라이언트 키를 등록하면 이 버튼이 자동으로 활성화됩니다.
            </p>
          </div>
        )}
      </SetupStep>

      <SetupStep
        number={2}
        title="캘린더·목록 찾기"
        description="계정 안의 캘린더와 할 일 목록을 불러옵니다. 아직 ResQ 데이터에는 반영하지 않습니다."
        complete={sources.length > 0}
        blocked={!connected}
      >
        {connected && (
          <PrimaryButton
            tone={tone}
            onClick={onFindSources}
            disabled={!online || syncing || catalogLoading}
            busy={providerBusy || catalogLoading}
          >
            {sources.length ? '목록 다시 확인' : '내 목록 찾기'}
          </PrimaryButton>
        )}
      </SetupStep>

      <SetupStep
        number={3}
        title="가져올 목록과 방식 선택"
        description="목록마다 ‘가져오기만’ 또는 ‘양방향’을 선택합니다. 처음이라면 가져오기만으로 시작해도 안전합니다."
        complete={selected.length > 0}
        blocked={!sources.length}
      >
        {sources.length > 0 && onToggleSource && onChangeSourceMode && (
          <IntegrationSourcePicker
            sources={sources}
            pendingIds={sourcePendingIds}
            disabled={!online}
            onToggle={onToggleSource}
            onModeChange={onChangeSourceMode}
          />
        )}
      </SetupStep>

      <SetupStep
        number={4}
        title="첫 동기화"
        description="선택한 목록에서 최근 90일과 앞으로 1년을 가져옵니다. 이후 연동 화면을 열 때 15분 이상 지났으면 자동으로 최신 상태를 확인합니다."
        complete={Boolean(syncedAt)}
        blocked={!selected.length}
      >
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton
              tone={tone}
              onClick={onSync}
              disabled={!online || syncing}
              busy={providerBusy}
            >
              {syncedAt ? '지금 다시 동기화' : '첫 동기화 시작'}
            </PrimaryButton>
            <span className="font-sans text-xs text-cream/65">
              마지막 완료: {formatSyncTime(syncedAt)}
            </span>
          </div>
        )}
      </SetupStep>
    </ol>
  )
}

function DeviceSetup({
  platform,
  nativeDeviceAvailable,
  nativeDeviceProvider,
  sources,
  sourcePendingIds,
  online,
  catalogLoading,
  syncing,
  syncingProvider,
  onConnect,
  onSync,
  onToggleSource,
  onChangeSourceMode,
}: {
  platform: 'apple' | 'android'
  nativeDeviceAvailable: boolean
  nativeDeviceProvider: 'apple' | 'android' | null
  sources: IntegrationSource[]
  sourcePendingIds: ReadonlySet<string>
  online: boolean
  catalogLoading: boolean
  syncing: boolean
  syncingProvider: IntegrationProvider | null
  onConnect?: () => void
  onSync?: () => void
  onToggleSource?: (source: IntegrationSource) => void
  onChangeSourceMode?: (source: IntegrationSource, mode: IntegrationSyncMode) => void
}) {
  const inCorrectApp = nativeDeviceAvailable && nativeDeviceProvider === platform
  const selected = sources.filter((source) => source.selected)
  const syncedAt = sources.map((source) => source.last_synced_at).filter(Boolean).sort().at(-1) ?? null
  const apple = platform === 'apple'

  return (
    <ol>
      <SetupStep
        number={1}
        title={apple ? 'ResQ iPhone 앱에서 열기' : 'ResQ Android 앱에서 열기'}
        description={apple
          ? '웹 브라우저는 Apple Calendar와 Reminders를 직접 읽을 수 없습니다. ResQ 앱이 EventKit 권한을 받아 연결합니다.'
          : '기기에 저장된 Galaxy·Google·Outlook 캘린더는 ResQ Android 앱이 시스템 캘린더 권한으로 연결합니다.'}
        complete={inCorrectApp}
      >
        {inCorrectApp ? (
          <span className="inline-flex items-center gap-2 rounded-xl bg-neon/10 px-3 py-2 font-sans text-sm text-neon">
            <Smartphone size={14} />
            ResQ {apple ? 'iPhone' : 'Android'} 앱에서 실행 중
          </span>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ['1', apple ? 'TestFlight 설치' : 'Play 내부 테스트 설치'],
              ['2', 'ResQ 로그인'],
              ['3', '연동 페이지에서 권한 허용'],
            ].map(([number, text]) => (
              <div key={number} className="rounded-xl border border-cream/10 bg-cream/[0.035] p-3">
                <span className="font-grotesk text-neon">{number}</span>
                <p className="mt-2 font-sans text-xs leading-relaxed text-cream/70">{text}</p>
              </div>
            ))}
          </div>
        )}
      </SetupStep>

      <SetupStep
        number={2}
        title={apple ? 'Calendar·Reminders 권한 허용' : '기기 캘린더 권한 허용'}
        description="시스템 권한창에서 허용해야 목록을 확인할 수 있습니다. 선택한 목록의 제목·시간·완료 상태만 동기화합니다."
        complete={sources.length > 0}
        blocked={!inCorrectApp}
      >
        {inCorrectApp && (
          <PrimaryButton
            tone="violet"
            onClick={onConnect}
            disabled={!online || syncing || catalogLoading}
            busy={catalogLoading}
          >
            {sources.length ? '권한·목록 다시 확인' : '시스템 권한 허용'}
          </PrimaryButton>
        )}
      </SetupStep>

      <SetupStep
        number={3}
        title="목록과 동기화 방식 선택"
        description={apple
          ? 'Calendar와 Reminders 목록을 각각 선택하고, 수정 허용 범위를 정합니다.'
          : 'Android 캘린더를 선택합니다. 삼성 Reminder는 아래 Microsoft To Do 경로를 사용합니다.'}
        complete={selected.length > 0}
        blocked={!sources.length}
      >
        {sources.length > 0 && onToggleSource && onChangeSourceMode && (
          <IntegrationSourcePicker
            sources={sources}
            pendingIds={sourcePendingIds}
            disabled={!online}
            onToggle={onToggleSource}
            onModeChange={onChangeSourceMode}
          />
        )}
      </SetupStep>

      <SetupStep
        number={4}
        title="기기와 동기화"
        description="기기에서 읽은 일정은 ResQ 통합 타임라인에 출처와 함께 표시됩니다."
        complete={Boolean(syncedAt)}
        blocked={!selected.length}
      >
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton
              tone="violet"
              onClick={onSync}
              disabled={!online || syncing}
              busy={syncingProvider === platform}
            >
              {syncedAt ? '지금 다시 동기화' : '첫 동기화 시작'}
            </PrimaryButton>
            <span className="font-sans text-xs text-cream/65">
              마지막 완료: {formatSyncTime(syncedAt)}
            </span>
          </div>
        )}
      </SetupStep>
    </ol>
  )
}

export function IntegrationGuide({
  capabilities,
  connections,
  googleSources,
  microsoftSources,
  todoistSources,
  deviceSources,
  nativeDeviceAvailable,
  nativeDeviceProvider,
  sourcePendingIds,
  online,
  catalogLoading,
  syncing,
  syncingProvider,
  syncMessage,
  lastSyncSummary,
  onConnectGoogle,
  onConnectMicrosoft,
  onConnectTodoist,
  onRefreshGoogleSources,
  onRefreshMicrosoftSources,
  onRefreshTodoistSources,
  onSyncGoogle,
  onSyncMicrosoft,
  onSyncTodoist,
  onConnectDevice,
  onSyncDevice,
  onToggleSource,
  onChangeSourceMode,
  onOpenAdvanced,
}: {
  capabilities: IntegrationCapabilities
  connections: IntegrationConnection[]
  googleSources: IntegrationSource[]
  microsoftSources: IntegrationSource[]
  todoistSources: IntegrationSource[]
  deviceSources: IntegrationSource[]
  nativeDeviceAvailable: boolean
  nativeDeviceProvider: 'apple' | 'android' | null
  sourcePendingIds: ReadonlySet<string>
  online: boolean
  catalogLoading: boolean
  syncing: boolean
  syncingProvider: IntegrationProvider | null
  syncMessage: string | null
  lastSyncSummary: LastSyncSummary | null
  onConnectGoogle?: () => void
  onConnectMicrosoft?: () => void
  onConnectTodoist?: () => void
  onRefreshGoogleSources?: () => void
  onRefreshMicrosoftSources?: () => void
  onRefreshTodoistSources?: () => void
  onSyncGoogle?: () => void
  onSyncMicrosoft?: () => void
  onSyncTodoist?: () => void
  onConnectDevice?: () => void
  onSyncDevice?: () => void
  onToggleSource?: (source: IntegrationSource) => void
  onChangeSourceMode?: (source: IntegrationSource, mode: IntegrationSyncMode) => void
  onOpenAdvanced: () => void
}) {
  const [guide, setGuide] = useState<IntegrationGuideKey>('google')
  const connection = (provider: IntegrationProvider) => connections.find(
    (item) => item.provider === provider && ['active', 'error'].includes(item.status),
  ) ?? null
  const allSources = [
    ...googleSources,
    ...microsoftSources,
    ...todoistSources,
    ...deviceSources,
  ]
  const connectedCount = connections.filter((item) => item.status === 'active').length
    + (deviceSources.length ? 1 : 0)
  const selectedCount = allSources.filter((source) => source.selected).length
  const syncTimes = [
    ...connections.map((item) => item.last_synced_at),
    ...allSources.map((source) => source.last_synced_at),
  ].filter((value): value is string => Boolean(value))
  const lastSyncedAt = syncTimes.sort().at(-1) ?? null

  const renderGuide = () => {
    if (guide === 'google') {
      return (
        <OAuthSetup
          label="Google"
          provider="google"
          tone="neon"
          capability={capabilities.google}
          connection={connection('google')}
          sources={googleSources}
          sourcePendingIds={sourcePendingIds}
          online={online}
          syncing={syncing}
          syncingProvider={syncingProvider}
          catalogLoading={catalogLoading}
          onConnect={onConnectGoogle}
          onFindSources={onRefreshGoogleSources}
          onSync={onSyncGoogle}
          onToggleSource={onToggleSource}
          onChangeSourceMode={onChangeSourceMode}
        />
      )
    }
    if (guide === 'microsoft') {
      return (
        <OAuthSetup
          label="Microsoft"
          provider="microsoft"
          tone="sky"
          capability={capabilities.microsoft}
          connection={connection('microsoft')}
          sources={microsoftSources}
          sourcePendingIds={sourcePendingIds}
          online={online}
          syncing={syncing}
          syncingProvider={syncingProvider}
          catalogLoading={catalogLoading}
          onConnect={onConnectMicrosoft}
          onFindSources={onRefreshMicrosoftSources}
          onSync={onSyncMicrosoft}
          onToggleSource={onToggleSource}
          onChangeSourceMode={onChangeSourceMode}
        />
      )
    }
    if (guide === 'todoist') {
      return (
        <OAuthSetup
          label="Todoist"
          provider="todoist"
          tone="red"
          capability={capabilities.todoist}
          connection={connection('todoist')}
          sources={todoistSources}
          sourcePendingIds={sourcePendingIds}
          online={online}
          syncing={syncing}
          syncingProvider={syncingProvider}
          catalogLoading={catalogLoading}
          onConnect={onConnectTodoist}
          onFindSources={onRefreshTodoistSources}
          onSync={onSyncTodoist}
          onToggleSource={onToggleSource}
          onChangeSourceMode={onChangeSourceMode}
        />
      )
    }
    if (guide === 'apple') {
      return (
        <DeviceSetup
          platform="apple"
          nativeDeviceAvailable={nativeDeviceAvailable}
          nativeDeviceProvider={nativeDeviceProvider}
          sources={nativeDeviceProvider === 'apple' ? deviceSources : []}
          sourcePendingIds={sourcePendingIds}
          online={online}
          catalogLoading={catalogLoading}
          syncing={syncing}
          syncingProvider={syncingProvider}
          onConnect={onConnectDevice}
          onSync={onSyncDevice}
          onToggleSource={onToggleSource}
          onChangeSourceMode={onChangeSourceMode}
        />
      )
    }
    if (guide === 'galaxy') {
      return (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-cream/10 bg-cream/[0.025] p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-3">
              <Smartphone size={19} className="text-sky-700 dark:text-sky-300" />
              <div>
                <h3 className="font-grotesk text-lg uppercase">Galaxy Calendar</h3>
                <p className="font-sans text-xs text-cream/65">Android 시스템 캘린더 경로</p>
              </div>
            </div>
            <DeviceSetup
              platform="android"
              nativeDeviceAvailable={nativeDeviceAvailable}
              nativeDeviceProvider={nativeDeviceProvider}
              sources={nativeDeviceProvider === 'android' ? deviceSources : []}
              sourcePendingIds={sourcePendingIds}
              online={online}
              catalogLoading={catalogLoading}
              syncing={syncing}
              syncingProvider={syncingProvider}
              onConnect={onConnectDevice}
              onSync={onSyncDevice}
              onToggleSource={onToggleSource}
              onChangeSourceMode={onChangeSourceMode}
            />
          </div>
          <div className="rounded-2xl border border-sky-300/15 bg-sky-300/[0.035] p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-3">
              <ListChecks size={19} className="text-sky-700 dark:text-sky-300" />
              <div>
                <h3 className="font-grotesk text-lg uppercase">Samsung Reminder</h3>
                <p className="font-sans text-xs text-cream/65">Microsoft To Do 공식 동기화 경로</p>
              </div>
            </div>
            <ol className="flex flex-col gap-3">
              {[
                'Samsung Reminder 앱 설정에서 Microsoft To Do 동기화 켜기',
                '이 화면에서 Microsoft 계정 연결',
                'Microsoft To Do 목록 선택 후 동기화',
              ].map((text, index) => (
                <li key={text} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-300/15 font-grotesk text-sm text-sky-700 dark:text-sky-200">
                    {index + 1}
                  </span>
                  <p className="pt-1 font-sans text-sm leading-relaxed text-cream/70">{text}</p>
                </li>
              ))}
            </ol>
            <PrimaryButton
              tone="sky"
              onClick={() => setGuide('microsoft')}
              disabled={!online}
            >
              Microsoft 연결로 이동 <ChevronRight size={13} />
            </PrimaryButton>
          </div>
        </div>
      )
    }
    return (
      <div className="rounded-2xl border border-amber-200/15 bg-amber-200/[0.035] p-5 sm:p-7">
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            {
              Icon: HardDriveDownload,
              title: 'ICS 파일 가져오기',
              text: '한 번 내보낸 .ics 파일을 ResQ에 복사합니다.',
            },
            {
              Icon: RefreshCw,
              title: 'ICS URL 구독',
              text: '공개 구독 주소를 저장하고 필요할 때 새로고침합니다.',
            },
            {
              Icon: ArrowLeftRight,
              title: 'CalDAV',
              text: '앱 비밀번호로 캘린더 서버와 양방향 연결합니다.',
            },
          ].map(({ Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-cream/10 bg-surfaceRaised/55 p-4">
              <Icon size={17} className="text-amber-800 dark:text-amber-200" />
              <h3 className="mt-4 font-grotesk text-sm uppercase">{title}</h3>
              <p className="mt-2 font-sans text-xs leading-relaxed text-cream/65">{text}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onOpenAdvanced}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-200 px-4 py-2.5 font-grotesk text-xs uppercase text-[#07111f]"
        >
          기타 연결 설정 열기 <Settings2 size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {!online && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-4">
          <WifiOff size={17} className="mt-0.5 shrink-0 text-amber-800 dark:text-amber-200" />
          <div>
            <strong className="font-grotesk text-sm uppercase text-amber-900 dark:text-amber-100">인터넷 연결 없음</strong>
            <p className="mt-1 font-sans text-sm leading-relaxed text-amber-900/75 dark:text-amber-100/60">
              현재 화면의 선택 상태는 확인할 수 있지만, 계정 연결과 동기화는 네트워크가 복구된 뒤 진행됩니다.
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="연동 현황">
        {[
          { label: '연결된 계정', value: connectedCount, detail: '활성 연결', Icon: Cloud },
          { label: '선택한 목록', value: selectedCount, detail: '통합 타임라인에 표시', Icon: ListChecks },
          {
            label: '마지막 동기화',
            value: lastSyncedAt ? '완료' : '대기',
            detail: formatSyncTime(lastSyncedAt),
            Icon: CalendarCheck2,
          },
        ].map(({ label, value, detail, Icon }) => (
          <LiquidGlass key={label} className="rounded-2xl">
            <div className="flex min-h-32 flex-col justify-between p-4">
              <div className="flex items-center justify-between">
                <span className="font-sans text-xs uppercase text-cream/65">{label}</span>
                <Icon size={15} className="text-neon" />
              </div>
              <div>
                <strong className="font-grotesk text-3xl font-normal uppercase text-cream">{value}</strong>
                <p className="mt-1 font-sans text-xs text-muted">{detail}</p>
              </div>
            </div>
          </LiquidGlass>
        ))}
      </section>

      <section aria-labelledby="integration-choice-title">
        <div className="mb-4">
          <p className="font-sans text-xs uppercase tracking-[0.22em] text-neon">Step 0</p>
          <h2 id="integration-choice-title" className="mt-1 font-grotesk text-2xl uppercase sm:text-3xl">
            지금 쓰는 앱부터 고르세요
          </h2>
          <p className="mt-2 font-sans text-sm leading-relaxed text-cream/65">
            선택하면 필요한 단계만 펼쳐집니다. 여러 서비스를 쓰면 하나씩 완료하면 됩니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {GUIDE_OPTIONS.map((option) => {
            const active = guide === option.key
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => setGuide(option.key)}
                className={`rounded-2xl border p-3 text-left transition sm:p-4 ${
                  active
                    ? 'border-cream/30 bg-cream/[0.08]'
                    : 'border-cream/10 bg-cream/[0.025] hover:border-cream/20'
                }`}
              >
                <span
                  className="block h-2 w-2 rounded-full"
                  style={{ backgroundColor: option.accent }}
                />
                <strong className="mt-4 block font-grotesk text-sm font-normal uppercase text-cream">
                  {option.label}
                </strong>
                <span className="mt-1 block font-sans text-xs leading-relaxed text-muted">
                  {option.description}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <LiquidGlass className="rounded-[24px]">
        <section className="p-5 sm:p-7" aria-label={`${guide} 단계별 연결 안내`}>
          <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-cream/10 pb-5">
            <div>
              <p className="font-sans text-xs uppercase tracking-[0.2em] text-muted">
                Guided setup
              </p>
              <h2 className="mt-1 font-grotesk text-2xl uppercase">
                {GUIDE_OPTIONS.find((option) => option.key === guide)?.label} 연결 가이드
              </h2>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-cream/10 px-3 py-2">
              <ShieldCheck size={13} className="text-neon" />
              <span className="font-sans text-xs text-cream/65">제목·시간·완료 상태만 동기화</span>
            </div>
          </div>
          {renderGuide()}
        </section>
      </LiquidGlass>

      {(syncMessage || lastSyncSummary) && (
        <section
          aria-live="polite"
          className="rounded-2xl border border-neon/20 bg-neon/[0.055] p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            {syncing ? (
              <LoaderCircle size={18} className="mt-0.5 shrink-0 animate-spin text-neon" />
            ) : (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-neon" />
            )}
            <div className="min-w-0 flex-1">
              <strong className="font-grotesk text-sm uppercase">
                {syncing ? '동기화 진행 중' : '최근 동기화 결과'}
              </strong>
              {syncMessage && (
                <p className="mt-1 font-sans text-sm leading-relaxed text-cream/70">
                  {syncMessage}
                </p>
              )}
              {lastSyncSummary && !syncing && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['가져옴', lastSyncSummary.result.importedEvents + lastSyncSummary.result.importedTasks],
                    ['원본에 보냄', lastSyncSummary.result.pushedEvents + lastSyncSummary.result.pushedTasks],
                    ['삭제 반영', lastSyncSummary.result.deletedEvents + lastSyncSummary.result.deletedTasks],
                    ['선택 목록', lastSyncSummary.result.sources],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-surfaceRaised/55 p-3">
                      <span className="font-sans text-xs text-muted">{label}</span>
                      <strong className="mt-1 block font-grotesk text-xl font-normal">{value}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-[24px] border border-violet-300/15 bg-violet-300/[0.035] p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-200">
              <MonitorSmartphone size={17} />
              <span className="font-sans text-xs uppercase tracking-[0.2em]">Native apps</span>
            </div>
            <h2 className="mt-4 font-grotesk text-2xl uppercase sm:text-3xl">
              ResQ 앱 버전도<br />준비되어 있습니다
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              {
                Icon: CheckCircle2,
                title: '앱 프로젝트',
                detail: 'iOS·Android 네이티브 셸 완료',
                done: true,
              },
              {
                Icon: CheckCircle2,
                title: '기기 연동',
                detail: 'EventKit·Calendar Provider 구현',
                done: true,
              },
              {
                Icon: Download,
                title: '스토어 배포',
                detail: '개발자 서명 후 TestFlight·Play 등록',
                done: false,
              },
            ].map(({ Icon, title, detail, done }) => (
              <div key={title} className="rounded-xl border border-cream/10 bg-surfaceRaised/55 p-3">
                <Icon size={15} className={done ? 'text-neon' : 'text-violet-700 dark:text-violet-200'} />
                <strong className="mt-3 block font-grotesk text-xs font-normal uppercase">{title}</strong>
                <p className="mt-1 font-sans text-xs leading-relaxed text-cream/65">{detail}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-5 flex items-start gap-2 border-t border-cream/10 pt-4 font-sans text-xs leading-relaxed text-cream/65">
          <Circle size={8} className="mt-1 shrink-0 fill-current" />
          앱스토어 파일 생성에는 Apple Developer·Google Play 개발자 계정과 각 플랫폼 서명이 필요합니다. 계정이 준비되면 같은 코드로 내부 테스트 배포가 가능합니다.
        </p>
      </section>

      <button
        type="button"
        onClick={onOpenAdvanced}
        className="mx-auto inline-flex items-center gap-2 font-sans text-sm text-cream/65 underline decoration-white/20 underline-offset-4 transition hover:text-cream"
      >
        ICS·CalDAV·Gmail·연결 해제 등 세부 설정 열기
        <ExternalLink size={12} />
      </button>
    </div>
  )
}
