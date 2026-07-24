import { describe, expect, it, vi } from 'vitest'
import { fetchOpenAlexTrending, fetchRelatedPapers } from './paperDiscovery'
import type { Paper } from './pubmed'

const paper: Paper = {
  pmid: '123',
  doi: '10.1/original',
  title: 'Original study',
  journal: 'JAMA',
  year: '2026',
  abstract: 'Abstract',
  url: 'https://doi.org/10.1/original',
  pmcid: null,
}

function client(papers: Paper[]) {
  const invoke = vi.fn().mockResolvedValue({ data: { papers }, error: null })
  return { functions: { invoke }, invoke } as any
}

describe('paper discovery edge client', () => {
  it('requests an OpenAlex trending shelf', async () => {
    const c = client([{ ...paper, doi: '10.1/hot', pmid: 'hot' }])
    expect(await fetchOpenAlexTrending(c, '내과')).toHaveLength(1)
    expect(c.invoke).toHaveBeenCalledWith('paper-discovery', {
      body: { action: 'trending', specialty: '내과', days: 365 },
    })
  })

  it('removes the selected paper from related results', async () => {
    const c = client([paper, { ...paper, doi: '10.1/related', pmid: '456' }])
    const related = await fetchRelatedPapers(c, paper)
    expect(related.map((item) => item.pmid)).toEqual(['456'])
  })
})
