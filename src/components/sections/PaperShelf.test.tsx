import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaperShelf } from './PaperShelf'
import type { Paper } from '../../lib/pubmed'

const papers: Paper[] = [
  { pmid: '1', pmcid: 'PMC1', title: 'DIEP flap outcomes in Asian patients', journal: 'Arch Plast Surg', year: '2026', abstract: 'A', url: 'https://x', authors: 'Kim J, Lee S', citedByCount: 42, src: 'MED', evidenceLevel: 'systematic-review', discoveryScore: 87 },
  { pmid: '2', pmcid: null, title: 'Rhinoplasty preprint', journal: '프리프린트', year: '2026', abstract: '', url: 'https://y', authors: 'Park H', citedByCount: 0, src: 'PPR' },
]

describe('PaperShelf', () => {
  it('renders the shelf title and cover cards with metadata', () => {
    render(<PaperShelf title="성형외과 신착" papers={papers} onOpen={vi.fn()} />)
    expect(screen.getByText('성형외과 신착')).toBeInTheDocument()
    const card = screen.getByText(/DIEP flap/).closest('article')!
    expect(within(card).getByText(/Arch Plast Surg/)).toBeInTheDocument()
    expect(within(card).getByText(/피인용 42/)).toBeInTheDocument()
    expect(within(card).getByText('OA 원문')).toBeInTheDocument()
    expect(within(card).getByText('체계적 문헌고찰')).toBeInTheDocument()
    expect(within(card).getByText('선별 87')).toBeInTheDocument()
    expect(screen.getByText(/프리프린트/)).toBeInTheDocument()
  })
  it('opens a paper on click', async () => {
    const onOpen = vi.fn()
    render(<PaperShelf title="t" papers={papers} onOpen={onOpen} />)
    await userEvent.click(screen.getByText(/DIEP flap/))
    expect(onOpen).toHaveBeenCalledWith(papers[0])
  })
  it('shows an empty note when there are no papers', () => {
    render(<PaperShelf title="t" papers={[]} onOpen={vi.fn()} emptyNote="논문이 없습니다" />)
    expect(screen.getByText('논문이 없습니다')).toBeInTheDocument()
  })
})
