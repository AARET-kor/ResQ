import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SyncPanel } from './SyncPanel'
import type { ExtractedEvent } from '../../lib/gmail'

const base = {
  googleConnected: true,
  onSyncMonth: vi.fn(),
  syncMessage: null,
  onDownloadIcs: vi.fn(),
  feedUrl: 'https://x.supabase.co/functions/v1/calendar-feed?token=abc',
  onScanGmail: vi.fn(),
  scanning: false,
  extracted: [] as ExtractedEvent[],
  onAddExtracted: vi.fn(),
  onDismissExtracted: vi.fn(),
}

describe('SyncPanel', () => {
  it('offers google sync, ics download, feed url and gmail scan when connected', async () => {
    const onSyncMonth = vi.fn(); const onDownloadIcs = vi.fn(); const onScanGmail = vi.fn()
    render(<SyncPanel {...base} onSyncMonth={onSyncMonth} onDownloadIcs={onDownloadIcs} onScanGmail={onScanGmail} />)
    await userEvent.click(screen.getByRole('button', { name: /Google 캘린더로 이번 달 보내기/ }))
    expect(onSyncMonth).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /\.ics 다운로드/ }))
    expect(onDownloadIcs).toHaveBeenCalled()
    expect(screen.getByText(/calendar-feed\?token=abc/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Gmail에서 일정 가져오기/ }))
    expect(onScanGmail).toHaveBeenCalled()
  })
  it('asks to reconnect google when not connected', () => {
    render(<SyncPanel {...base} googleConnected={false} />)
    expect(screen.getByText(/다시 로그인/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Google 캘린더로 이번 달 보내기/ })).not.toBeInTheDocument()
  })
  it('shows the sync message and scanning state', () => {
    render(<SyncPanel {...base} syncMessage="3건 동기화 완료" scanning={true} />)
    expect(screen.getByText('3건 동기화 완료')).toBeInTheDocument()
    expect(screen.getByText(/메일을 읽는 중/)).toBeInTheDocument()
  })
  it('renders extracted candidates with add/dismiss', async () => {
    const onAddExtracted = vi.fn(); const onDismissExtracted = vi.fn()
    const extracted: ExtractedEvent[] = [
      { title: '추계학술대회', starts_at: '2026-08-20T09:00:00+09:00', kind: 'conference', location: '코엑스', ends_at: null },
    ]
    render(<SyncPanel {...base} extracted={extracted} onAddExtracted={onAddExtracted} onDismissExtracted={onDismissExtracted} />)
    expect(screen.getByText('추계학술대회')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '일정에 추가' }))
    expect(onAddExtracted).toHaveBeenCalledWith(extracted[0])
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onDismissExtracted).toHaveBeenCalled()
  })
})
