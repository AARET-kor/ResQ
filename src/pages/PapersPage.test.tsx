import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PaperAnalysis } from '../lib/papers'
import type { Profile } from '../lib/profile'

const usePaperFeed = vi.fn()
const usePaperAnalysis = vi.fn()

vi.mock('../home/hooks/usePaperFeed', () => ({
  usePaperFeed: (...args: unknown[]) => usePaperFeed(...args),
}))
vi.mock('../home/hooks/usePaperAnalysis', () => ({
  usePaperAnalysis: (...args: unknown[]) => usePaperAnalysis(...args),
}))

import { PapersPage } from './PapersPage'

const profile: Profile = {
  id: 'u1',
  hospital: 'A병원',
  specialty: '내과',
  pgy: 2,
  nickname: '길동',
  training_start: '2024-03-01',
  training_end: '2028-02-28',
  xp: 0,
  mascot_level: 1,
  mascot_stage: 1,
}

const report: PaperAnalysis = {
  id: 'pa1',
  user_id: 'u1',
  pmid: '111',
  title: '저장된 심혈관 리포트',
  journal: 'NEJM',
  year: '2026',
  abstract: 'abstract',
  analysis: '## 요약',
  created_at: '2026-07-20T03:00:00.000Z',
  kind: 'report',
  source: 'NEJM',
}

describe('PapersPage workspace views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePaperFeed.mockReturnValue({
      shelves: [],
      loading: false,
      error: null,
      journals: [],
      selectedJournals: [],
      toggleJournal: vi.fn(),
      days: 7,
      setDays: vi.fn(),
      sortKey: 'date',
      sortDir: 'desc',
      setSortKey: vi.fn(),
      setSortDir: vi.fn(),
      refresh: vi.fn(),
      feed: ['내과'],
      toggleSpecialty: vi.fn(),
      specialtyNotice: null,
    })
    usePaperAnalysis.mockReturnValue({
      reports: [report],
      reportsLoading: false,
      reportsError: null,
      refreshReports: vi.fn(),
      selected: null,
      selectedTitle: null,
      analysis: null,
      analysisKind: null,
      loading: false,
      error: null,
      relatedPapers: [],
      relatedLoading: false,
      relatedError: null,
      ideation: null,
      ideationLoading: false,
      ideationError: null,
      open: vi.fn(),
      analyze: vi.fn(),
      uploadPdf: vi.fn(),
      openReport: vi.fn(),
      generateIdeation: vi.fn(),
      close: vi.fn(),
    })
  })

  it('switches from Breakdown to a dedicated Library intro and opens a report', async () => {
    render(<PapersPage profile={profile} onProfileChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '논문 Breakdown' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /내 Library/ }))
    expect(screen.getByRole('heading', { name: '내 Research Library' })).toBeInTheDocument()
    expect(screen.getByText('저장된 심혈관 리포트')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /저장된 심혈관 리포트 열기/ }))
    expect(usePaperAnalysis.mock.results[0].value.openReport).toHaveBeenCalledWith(report)

    await userEvent.click(screen.getByRole('tab', { name: 'Breakdown' }))
    expect(screen.getByRole('heading', { name: '논문 Breakdown' })).toBeInTheDocument()
  })
})
