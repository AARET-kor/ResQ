import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PapersSection } from './PapersSection'
import type { Paper } from '../../lib/pubmed'
import { journalsFor } from '../../lib/sources'

const papers: Paper[] = [
  { pmid: '111', title: 'Semaglutide outcomes', journal: 'NEJM', year: '2026', abstract: 'Abs one', url: 'https://pubmed.ncbi.nlm.nih.gov/111/', pmcid: null },
  { pmid: '222', title: 'AKI biomarkers', journal: 'Lancet', year: '2025', abstract: 'Abs two', url: 'https://pubmed.ncbi.nlm.nih.gov/222/', pmcid: null },
]

const JOURNALS = journalsFor('성형외과')

const base = {
  shelves: [{ label: '성형외과 신착', papers }],
  loading: false,
  error: null,
  journals: [] as ReturnType<typeof journalsFor>,
  selectedJournals: [] as string[],
  onToggleJournal: vi.fn(),
  days: 7 as 7 | 30,
  onDaysChange: vi.fn(),
  sortKey: 'date' as const,
  sortDir: 'desc' as const,
  onSortKeyChange: vi.fn(),
  onSortDirChange: vi.fn(),
  onRefresh: vi.fn(),
  onOpen: vi.fn(),
  onUploadPdf: vi.fn(),
  analysisLoading: false,
}

describe('PapersSection', () => {
  it('renders shelves and a refresh button', () => {
    render(<PapersSection {...base} />)
    expect(screen.getByText(/MEDLINE.*Europe PMC.*OpenAlex/)).toBeInTheDocument()
    expect(screen.getByText('성형외과 신착')).toBeInTheDocument()
    expect(screen.getByText('Semaglutide outcomes')).toBeInTheDocument()
    expect(screen.getByText(/NEJM/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새 논문 불러오기' })).toBeInTheDocument()
  })

  it('calls onRefresh and onOpen', async () => {
    const onRefresh = vi.fn(); const onOpen = vi.fn()
    render(<PapersSection {...base} onRefresh={onRefresh} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: '새 논문 불러오기' }))
    expect(onRefresh).toHaveBeenCalled()
    await userEvent.click(screen.getByText('Semaglutide outcomes'))
    expect(onOpen).toHaveBeenCalledWith(papers[0])
  })

  it('shows empty and loading states', () => {
    const { rerender } = render(<PapersSection {...base} shelves={[]} loading={true} />)
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument()
    rerender(<PapersSection {...base} shelves={[]} loading={false} />)
    expect(screen.getByText(/새 논문 불러오기.*를 눌러/)).toBeInTheDocument()
  })

  it('filters by journal chips and period', async () => {
    const onToggleJournal = vi.fn(); const onDaysChange = vi.fn()
    render(<PapersSection {...base} journals={JOURNALS} selectedJournals={[]}
      onToggleJournal={onToggleJournal} days={7} onDaysChange={onDaysChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Archives of Plastic Surgery/ }))
    expect(onToggleJournal).toHaveBeenCalledWith('aps')
    await userEvent.click(screen.getByRole('button', { name: '최근 30일' }))
    expect(onDaysChange).toHaveBeenCalledWith(30)
  })

  it('renders unindexed journals (AAPS) as homepage link chips, not filter buttons', () => {
    render(<PapersSection {...base} journals={JOURNALS} />)
    const aaps = JOURNALS.find((j) => j.id === 'aaps')!
    const link = screen.getByRole('link', { name: new RegExp(aaps.label.replace(/[()]/g, '\\$&')) })
    expect(link).toHaveAttribute('href', aaps.homepage)
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByRole('button', { name: new RegExp(aaps.label.replace(/[()]/g, '\\$&')) })).not.toBeInTheDocument()
  })

  it('fires sort key and direction changes', async () => {
    const onSortKeyChange = vi.fn(); const onSortDirChange = vi.fn()
    render(<PapersSection {...base} onSortKeyChange={onSortKeyChange} onSortDirChange={onSortDirChange} />)
    await userEvent.selectOptions(screen.getByLabelText('정렬'), 'cited')
    expect(onSortKeyChange).toHaveBeenCalledWith('cited')
    await userEvent.click(screen.getByRole('button', { name: '정렬 방향' }))
    expect(onSortDirChange).toHaveBeenCalledWith('asc')
  })

  it('fires onUploadPdf with the chosen file', async () => {
    const onUploadPdf = vi.fn()
    render(<PapersSection {...base} onUploadPdf={onUploadPdf} />)
    const file = new File(['%PDF-'], 'paper.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('PDF 업로드'), file)
    expect(onUploadPdf).toHaveBeenCalledWith(file)
  })

  it('renders specialty chips with abbrs; primary is locked, others toggle', async () => {
    const onToggleSpecialty = vi.fn()
    render(<PapersSection {...base}
      specialtyOptions={[{ name: '성형외과', abbr: 'PS' }, { name: '피부과', abbr: 'DM' }]}
      feed={['성형외과']}
      primary="성형외과"
      onToggleSpecialty={onToggleSpecialty} />)
    const psChip = screen.getByRole('button', { name: /성형외과.*PS/ })
    expect(psChip).toBeDisabled() // primary — always on
    await userEvent.click(screen.getByRole('button', { name: /피부과.*DM/ }))
    expect(onToggleSpecialty).toHaveBeenCalledWith('피부과')
  })

  it('shows the specialty save notice when provided', () => {
    render(<PapersSection {...base}
      specialtyOptions={[{ name: '성형외과', abbr: 'PS' }]}
      feed={['성형외과']} primary="성형외과"
      specialtyNotice="관심 전공 저장 실패 — 이번 세션에만 적용됩니다" />)
    expect(screen.getByText(/이번 세션에만 적용/)).toBeInTheDocument()
  })
})
