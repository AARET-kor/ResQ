import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaperLibrary } from './PaperLibrary'
import type { PaperAnalysis } from '../../lib/papers'

const reports: PaperAnalysis[] = [
  {
    id: 'pa-new',
    user_id: 'u1',
    pmid: '111',
    title: 'Semaglutide outcomes',
    journal: 'NEJM',
    year: '2026',
    abstract: 'Abstract',
    analysis: '## 요약',
    created_at: '2026-07-20T03:00:00.000Z',
    kind: 'report',
    has_fulltext: true,
    source: 'NEJM',
  },
  {
    id: 'pa-old',
    user_id: 'u1',
    pmid: 'pdf-1',
    title: 'AKI biomarker pilot',
    journal: 'PDF 업로드',
    year: '2025',
    abstract: null,
    analysis: '① 요약',
    created_at: '2026-06-01T03:00:00.000Z',
    kind: 'abstract',
    has_fulltext: false,
    source: 'pdf',
  },
]

const base = {
  reports,
  loading: false,
  error: null as string | null,
  onRetry: vi.fn(),
  onOpenReport: vi.fn(),
  onShowBreakdown: vi.fn(),
}

describe('PaperLibrary', () => {
  it('renders report cards with counts, source and saved date', () => {
    render(<PaperLibrary {...base} />)
    expect(screen.getByRole('heading', { name: '내 리포트 서가' })).toBeInTheDocument()
    expect(screen.getByText('Semaglutide outcomes')).toBeInTheDocument()
    expect(screen.getByText('AKI biomarker pilot')).toBeInTheDocument()
    expect(screen.getByText('PDF 업로드', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getAllByText(/2026년/).length).toBeGreaterThan(0)
  })

  it('searches title, journal and source and filters by report kind', async () => {
    render(<PaperLibrary {...base} />)
    const search = screen.getByRole('searchbox', { name: 'Library 검색' })
    await userEvent.type(search, 'NEJM')
    expect(screen.getByText('Semaglutide outcomes')).toBeInTheDocument()
    expect(screen.queryByText('AKI biomarker pilot')).not.toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.click(screen.getByRole('button', { name: '초록 분석' }))
    expect(screen.queryByText('Semaglutide outcomes')).not.toBeInTheDocument()
    expect(screen.getByText('AKI biomarker pilot')).toBeInTheDocument()
  })

  it('sorts by oldest date and title', async () => {
    render(<PaperLibrary {...base} />)
    const cards = () => screen.getAllByRole('button', { name: /열기/ })

    expect(cards()[0]).toHaveAccessibleName(/Semaglutide outcomes/)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Library 정렬' }), 'oldest')
    expect(cards()[0]).toHaveAccessibleName(/AKI biomarker pilot/)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Library 정렬' }), 'title')
    expect(cards()[0]).toHaveAccessibleName(/AKI biomarker pilot/)
  })

  it('opens the selected saved report', async () => {
    const onOpenReport = vi.fn()
    render(<PaperLibrary {...base} onOpenReport={onOpenReport} />)
    await userEvent.click(screen.getByRole('button', { name: /Semaglutide outcomes 열기/ }))
    expect(onOpenReport).toHaveBeenCalledWith(reports[0])
  })

  it('renders loading, error retry and empty library states', async () => {
    const onRetry = vi.fn()
    const onShowBreakdown = vi.fn()
    const { rerender } = render(
      <PaperLibrary
        {...base}
        reports={[]}
        loading
        onRetry={onRetry}
      />,
    )
    expect(screen.getByLabelText('내 Library 불러오는 중')).toBeInTheDocument()

    rerender(
      <PaperLibrary
        {...base}
        reports={[]}
        error="Library 요청 실패"
        onRetry={onRetry}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(onRetry).toHaveBeenCalled()

    rerender(
      <PaperLibrary
        {...base}
        reports={[]}
        onShowBreakdown={onShowBreakdown}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Breakdown으로 이동' }))
    expect(onShowBreakdown).toHaveBeenCalled()
  })

  it('resets a search with no results', async () => {
    render(<PaperLibrary {...base} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Library 검색' }), '없는 논문')
    expect(screen.getByText('조건에 맞는 리포트가 없습니다.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '검색 조건 초기화' }))
    expect(screen.getByText('Semaglutide outcomes')).toBeInTheDocument()
  })
})
