import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PapersSection } from './PapersSection'
import type { Paper } from '../../lib/pubmed'

const papers: Paper[] = [
  { pmid: '111', title: 'Semaglutide outcomes', journal: 'NEJM', year: '2026', abstract: 'Abs one', url: 'https://pubmed.ncbi.nlm.nih.gov/111/' },
  { pmid: '222', title: 'AKI biomarkers', journal: 'Lancet', year: '2025', abstract: 'Abs two', url: 'https://pubmed.ncbi.nlm.nih.gov/222/' },
]

describe('PapersSection', () => {
  it('renders paper cards and a refresh button', () => {
    render(<PapersSection papers={papers} loading={false} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={null} analysis={null}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    expect(screen.getByText('Semaglutide outcomes')).toBeInTheDocument()
    expect(screen.getByText(/NEJM/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새 논문 불러오기' })).toBeInTheDocument()
  })
  it('calls onRefresh and onOpen', async () => {
    const onRefresh = vi.fn(); const onOpen = vi.fn()
    render(<PapersSection papers={papers} loading={false} error={null}
      onRefresh={onRefresh} onOpen={onOpen} selected={null} analysis={null}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '새 논문 불러오기' }))
    expect(onRefresh).toHaveBeenCalled()
    const card = screen.getByText('Semaglutide outcomes').closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: 'AI 분석 열기' }))
    expect(onOpen).toHaveBeenCalledWith(papers[0])
  })
  it('shows the drawer with analysis when a paper is selected', () => {
    render(<PapersSection papers={papers} loading={false} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={papers[0]} analysis={'① 요약...'}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('① 요약...')).toBeInTheDocument()
    expect(within(dialog).getByText('Abs one')).toBeInTheDocument()
  })
  it('shows a friendly notice when analysis failed', () => {
    render(<PapersSection papers={papers} loading={false} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={papers[0]} analysis={null}
      analysisLoading={false} analysisError={'분석 서버에 연결할 수 없습니다.'} onClose={vi.fn()} />)
    expect(screen.getByText(/분석 서버에 연결할 수 없습니다/)).toBeInTheDocument()
  })
  it('shows empty and loading states', () => {
    const { rerender } = render(<PapersSection papers={[]} loading={true} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={null} analysis={null}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument()
    rerender(<PapersSection papers={[]} loading={false} error={null}
      onRefresh={vi.fn()} onOpen={vi.fn()} selected={null} analysis={null}
      analysisLoading={false} analysisError={null} onClose={vi.fn()} />)
    expect(screen.getByText(/새 논문 불러오기.*를 눌러/)).toBeInTheDocument()
  })
})
