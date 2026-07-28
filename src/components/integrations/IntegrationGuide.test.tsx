import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  IntegrationConnection,
  IntegrationSource,
} from '../../lib/integrations'
import { IntegrationGuide } from './IntegrationGuide'

const capabilities = {
  google: true,
  microsoft: true,
  todoist: true,
  ics: true,
  caldav: true,
}

function connection(
  provider: IntegrationConnection['provider'],
  overrides: Partial<IntegrationConnection> = {},
): IntegrationConnection {
  return {
    id: `connection-${provider}`,
    user_id: 'u1',
    provider,
    provider_account_id: 'account-1',
    account_email: `${provider}@example.com`,
    account_label: provider,
    status: 'active',
    scopes: [],
    sync_mode: 'two_way',
    auto_sync_enabled: true,
    provider_config: {},
    last_synced_at: null,
    last_error: null,
    ...overrides,
  }
}

function source(
  provider: IntegrationSource['provider'],
  overrides: Partial<IntegrationSource> = {},
): IntegrationSource {
  return {
    id: `source-${provider}`,
    user_id: 'u1',
    connection_id: `connection-${provider}`,
    provider,
    resource_type: 'calendar',
    external_id: 'primary',
    name: '기본 캘린더',
    color: '#6FFF00',
    selected: true,
    is_default: true,
    can_write: true,
    sync_mode: 'two_way',
    metadata: {},
    last_synced_at: null,
    last_error: null,
    ...overrides,
  }
}

const baseProps = {
  capabilities,
  connections: [] as IntegrationConnection[],
  googleSources: [] as IntegrationSource[],
  microsoftSources: [] as IntegrationSource[],
  todoistSources: [] as IntegrationSource[],
  deviceSources: [] as IntegrationSource[],
  nativeDeviceAvailable: false,
  nativeDeviceProvider: null,
  sourcePendingIds: new Set<string>(),
  online: true,
  catalogLoading: false,
  syncing: false,
  syncingProvider: null,
  syncMessage: null,
  lastSyncSummary: null,
  onOpenAdvanced: vi.fn(),
}

describe('IntegrationGuide', () => {
  it('starts with a clear Google account-to-sync sequence', async () => {
    const onConnectGoogle = vi.fn()
    render(<IntegrationGuide {...baseProps} onConnectGoogle={onConnectGoogle} />)

    expect(screen.getByRole('heading', { name: 'Google 연결 가이드' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Google 계정 연결' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '캘린더·목록 찾기' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '가져올 목록과 방식 선택' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '첫 동기화' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Google 계정 연결' }))
    expect(onConnectGoogle).toHaveBeenCalledOnce()
  })

  it('lets a connected user choose sources, direction and start sync', async () => {
    const onToggleSource = vi.fn()
    const onChangeSourceMode = vi.fn()
    const onSyncGoogle = vi.fn()
    const googleSource = source('google')
    render(
      <IntegrationGuide
        {...baseProps}
        connections={[connection('google')]}
        googleSources={[googleSource]}
        onToggleSource={onToggleSource}
        onChangeSourceMode={onChangeSourceMode}
        onSyncGoogle={onSyncGoogle}
      />,
    )

    expect(screen.getByText('google@example.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /가져오기만/ }))
    expect(onChangeSourceMode).toHaveBeenCalledWith(googleSource, 'read_only')

    await userEvent.click(screen.getByRole('button', { name: '첫 동기화 시작' }))
    expect(onSyncGoogle).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('checkbox', { name: /기본 캘린더 제외/ }))
    expect(onToggleSource).toHaveBeenCalledWith(googleSource)
  })

  it('explains the native app route for iPhone Calendar and Reminders', async () => {
    render(<IntegrationGuide {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /iPhone/ }))

    expect(screen.getByRole('heading', { name: 'iPhone 연결 가이드' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ResQ iPhone 앱에서 열기' })).toBeInTheDocument()
    expect(screen.getByText('TestFlight 설치')).toBeInTheDocument()
    expect(screen.getByText(/EventKit 권한/)).toBeInTheDocument()
  })

  it('blocks network actions while offline and opens advanced tools on demand', async () => {
    const onConnectGoogle = vi.fn()
    const onOpenAdvanced = vi.fn()
    render(
      <IntegrationGuide
        {...baseProps}
        online={false}
        onConnectGoogle={onConnectGoogle}
        onOpenAdvanced={onOpenAdvanced}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('인터넷 연결 없음')
    expect(screen.getByRole('button', { name: 'Google 계정 연결' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /세부 설정 열기/ }))
    expect(onOpenAdvanced).toHaveBeenCalledOnce()
  })
})
