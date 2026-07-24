import { describe, it, expect, vi } from 'vitest'
import { epmcQueryFor, searchEuropePmc, fetchEpmcFullText } from './europepmc'

const HIT = {
  id: '41234567', source: 'MED', pmid: '41234567', pmcid: 'PMC9999999',
  title: 'DIEP flap outcomes', authorString: 'Kim J, Lee S.',
  journalInfo: { journal: { title: 'Arch Plast Surg' } }, pubYear: '2026',
  citedByCount: 42, abstractText: 'Background...', doi: '10.1/abc',
  pubTypeList: { pubType: ['Randomized Controlled Trial'] }, isOpenAccess: 'Y',
}
const PPR = {
  id: 'PPR123', source: 'PPR', title: 'Preprint on rhinoplasty', authorString: 'Park H.',
  journalInfo: {}, pubYear: '2026', citedByCount: 0, abstractText: 'Pre...',
}

describe('epmcQueryFor', () => {
  it('builds specialty and journal-scoped queries with a date window', () => {
    const q1 = epmcQueryFor('성형외과', [], 7)
    expect(q1).toContain('"plastic surgery"')
    expect(q1).toContain('TITLE_ABS:')
    expect(q1).toContain('SRC:MED')
    expect(q1).toContain('HAS_ABSTRACT:Y')
    expect(q1).toContain('Retracted Publication')
    expect(q1).toContain('FIRST_PDATE:[')
    const q2 = epmcQueryFor('성형외과', ['Arch Plast Surg'], undefined)
    expect(q2).toContain('JOURNAL:"Arch Plast Surg"')
    expect(q2).not.toContain('FIRST_PDATE')
  })
  it('quotes multi-word phrases so bare "medicine" never floods results', () => {
    const q = epmcQueryFor('마취과', [], undefined) // legacy alias resolves too
    expect(q).toContain('"anesthesiology"')
    expect(q).toContain('"pain medicine"')
    expect(q).not.toMatch(/OR pain medicine\)/) // the old unquoted failure mode
    const fallback = epmcQueryFor('피부과', [], undefined)
    expect(fallback).toContain('"dermatology"')
  })
  it('adds evidence and open-access filters for curated shelves', () => {
    expect(epmcQueryFor('내과', [], 1825, 'evidence')).toContain('Meta-Analysis')
    expect(epmcQueryFor('내과', [], 365, 'open-access')).toContain('OPEN_ACCESS:Y')
  })
  it('can combine journal filters with the specialty query', () => {
    const query = epmcQueryFor('성형외과', ['Lancet'], 365, 'latest', true)
    expect(query).toContain('JOURNAL:"Lancet"')
    expect(query).toContain('TITLE_ABS:"plastic surgery"')
  })
})

describe('searchEuropePmc', () => {
  it('maps hits into Papers (pmid fallback to id, epmc url when no doi)', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ resultList: { result: [HIT, PPR] } }) })
    const papers = await searchEuropePmc('성형외과', fetcher as any, { sort: 'cited', pageSize: 10 })
    expect(fetcher.mock.calls[0][0]).toContain('europepmc')
    expect(fetcher.mock.calls[0][0]).toContain('sort=CITED')
    expect(papers[0]).toMatchObject({
      pmid: '41234567', pmcid: 'PMC9999999', journal: 'Arch Plast Surg',
      citedByCount: 42, authors: 'Kim J, Lee S.', url: 'https://doi.org/10.1/abc',
      doi: '10.1/abc', evidenceLevel: 'rct', isOpenAccess: true,
    })
    expect(papers[1].pmid).toBe('PPR123')
    expect(papers[1].url).toContain('europepmc.org/article/PPR/PPR123')
    expect(papers[1].src).toBe('PPR')
  })
  it('returns [] on empty results and throws on http error', async () => {
    const ok = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
    expect(await searchEuropePmc('성형외과', ok as any, {})).toEqual([])
    const bad = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(searchEuropePmc('성형외과', bad as any, {})).rejects.toThrow()
  })
})

describe('fetchEpmcFullText', () => {
  it('fetches PMC fullTextXML and extracts the body', async () => {
    const xml = '<article><body><sec><title>Methods</title><p>42 flaps.</p></sec></body></article>'
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(xml) })
    const text = await fetchEpmcFullText('PMC9999999', fetcher as any)
    expect(text).toContain('42 flaps.')
    expect(fetcher.mock.calls[0][0]).toContain('PMC9999999/fullTextXML')
  })
  it('returns empty string on failure (fallback handled by caller)', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
    expect(await fetchEpmcFullText('PMC1', fetcher as any)).toBe('')
  })
})
