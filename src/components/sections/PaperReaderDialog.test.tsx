import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaperReaderDialog } from './PaperReaderDialog'
import type { Paper } from '../../lib/pubmed'

const paper: Paper = {
  pmid: '111',
  title: 'Semaglutide outcomes',
  journal: 'NEJM',
  year: '2026',
  abstract: 'English abstract',
  url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
  pmcid: null,
}

const base = {
  selected: paper as Paper | null,
  selectedTitle: paper.title as string | null,
  analysis: null as string | null,
  analysisKind: null as 'abstract' | 'report' | null,
  analysisLoading: false,
  analysisError: null as string | null,
  onClose: vi.fn(),
  onAnalyze: vi.fn(),
  onOpen: vi.fn(),
}

describe('PaperReaderDialog', () => {
  it('does not render without a selected paper', () => {
    render(<PaperReaderDialog {...base} selected={null} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the abstract and saved analysis', () => {
    render(
      <PaperReaderDialog
        {...base}
        analysis="① 요약..."
        analysisKind="abstract"
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('① 요약...')).toBeInTheDocument()
    expect(within(dialog).getByText('English abstract')).toBeInTheDocument()
  })

  it('shows a friendly analysis failure and closes with Escape', async () => {
    const onClose = vi.fn()
    render(
      <PaperReaderDialog
        {...base}
        onClose={onClose}
        analysisError="분석 서버에 연결할 수 없습니다."
      />,
    )
    expect(screen.getByText(/분석 서버에 연결할 수 없습니다/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('offers a markdown download when a report is open', () => {
    render(
      <PaperReaderDialog
        {...base}
        analysis={'## 요약\n내용'}
        analysisKind="report"
      />,
    )
    expect(screen.getByRole('link', { name: /리포트 다운로드/ })).toHaveAttribute(
      'download',
      'resq-paper-report.md',
    )
  })

  it('shows source-graph related papers and opens one', async () => {
    const onOpen = vi.fn()
    const related: Paper = {
      ...paper,
      pmid: '333',
      title: 'Related evidence paper',
      sourceProvider: 'OpenAlex',
      isOpenAccess: true,
    }
    render(
      <PaperReaderDialog
        {...base}
        relatedPapers={[related]}
        onOpen={onOpen}
      />,
    )
    await userEvent.click(screen.getByRole('tab', { name: '연관 논문 1' }))
    await userEvent.click(screen.getByRole('button', { name: /Related evidence paper/ }))
    expect(onOpen).toHaveBeenCalledWith(related)
  })

  it('generates and displays source-grounded research ideation', async () => {
    const onGenerateIdeation = vi.fn()
    const { rerender } = render(
      <PaperReaderDialog
        {...base}
        onGenerateIdeation={onGenerateIdeation}
      />,
    )
    await userEvent.click(screen.getByRole('tab', { name: '연구 아이디에이션' }))
    await userEvent.click(screen.getByRole('button', { name: '아이디에이션 생성' }))
    expect(onGenerateIdeation).toHaveBeenCalled()

    rerender(
      <PaperReaderDialog
        {...base}
        onGenerateIdeation={onGenerateIdeation}
        ideation="## 검증 가능한 가설 3개"
      />,
    )
    expect(screen.getByText('## 검증 가능한 가설 3개')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /아이디에이션 다운로드/ })).toBeInTheDocument()
  })
})
