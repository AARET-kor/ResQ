import { describe, expect, it } from 'vitest'
import {
  AUTO_SYNC_INTERVAL_MS,
  staleAutoSyncConnections,
  type IntegrationConnection,
} from './integrations'

function connection(
  overrides: Partial<IntegrationConnection> = {},
): IntegrationConnection {
  return {
    id: 'connection-1',
    user_id: 'u1',
    provider: 'google',
    provider_account_id: 'account-1',
    account_email: null,
    account_label: null,
    status: 'active',
    scopes: [],
    sync_mode: 'two_way',
    auto_sync_enabled: true,
    provider_config: {},
    last_synced_at: '2026-07-28T00:00:00.000Z',
    last_error: null,
    ...overrides,
  }
}

describe('staleAutoSyncConnections', () => {
  const now = new Date('2026-07-28T01:00:00.000Z').getTime()

  it('returns active supported connections older than the auto-sync interval', () => {
    expect(staleAutoSyncConnections([connection()], now)).toHaveLength(1)
  })

  it('does not run an automatic first sync before source review', () => {
    expect(staleAutoSyncConnections([
      connection({ last_synced_at: null }),
    ], now)).toEqual([])
  })

  it('skips recent, disabled, expired and device-only connections', () => {
    const recent = new Date(now - AUTO_SYNC_INTERVAL_MS + 1_000).toISOString()
    expect(staleAutoSyncConnections([
      connection({ id: 'recent', last_synced_at: recent }),
      connection({ id: 'disabled', auto_sync_enabled: false }),
      connection({ id: 'expired', status: 'expired' }),
      connection({ id: 'apple', provider: 'apple' }),
    ], now)).toEqual([])
  })
})
