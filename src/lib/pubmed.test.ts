import { describe, it, expect, vi } from 'vitest'
import { pubmedQueryFor, parsePubmedArticles, fetchRecentPapers, fetchPmcFullText } from './pubmed'

const XML = `<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>111</PMID>
      <Article>
        <Journal><Title>NEJM</Title><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal>
        <ArticleTitle>Semaglutide outcomes</ArticleTitle>
        <Abstract><AbstractText Label="BACKGROUND">Part one.</AbstractText><AbstractText>Part two.</AbstractText></Abstract>
      </Article>
    </MedlineCitation>
    <PubmedData><ArticleIdList>
      <ArticleId IdType="pubmed">111</ArticleId>
      <ArticleId IdType="pmc">PMC7654321</ArticleId>
    </ArticleIdList></PubmedData>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>222</PMID>
      <Article>
        <Journal><Title>Lancet</Title><JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue></Journal>
        <ArticleTitle>No abstract paper</ArticleTitle>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>`

describe('pubmedQueryFor', () => {
  it('maps specialties to English queries with a generic fallback', () => {
    expect(pubmedQueryFor('내과')).toContain('internal medicine')
    expect(pubmedQueryFor('마취과')).toContain('anesthesiology') // legacy alias
    expect(pubmedQueryFor('정형외과')).toContain('orthopedic')
    expect(pubmedQueryFor('성형외과')).toContain('plastic')
    expect(pubmedQueryFor('우주과')).toContain('medicine')
    expect(pubmedQueryFor(null)).toContain('medicine')
  })
})

describe('parsePubmedArticles', () => {
  it('extracts pmid/title/journal/year/abstract and builds the URL', () => {
    const papers = parsePubmedArticles(XML)
    expect(papers).toHaveLength(2)
    expect(papers[0]).toMatchObject({
      pmid: '111',
      title: 'Semaglutide outcomes',
      journal: 'NEJM',
      year: '2026',
      url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
    })
    expect(papers[0].abstract).toBe('Part one. Part two.')
    expect(papers[1].abstract).toBe('')
  })
})

describe('fetchRecentPapers', () => {
  it('searches then fetches and parses', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ esearchresult: { idlist: ['111', '222'] } }) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(XML) })
    const papers = await fetchRecentPapers('내과', fetcher as any)
    expect(papers).toHaveLength(2)
    expect(fetcher.mock.calls[0][0]).toContain('esearch.fcgi')
    expect(fetcher.mock.calls[0][0]).toContain(encodeURIComponent('internal medicine'))
    expect(fetcher.mock.calls[1][0]).toContain('efetch.fcgi')
    expect(fetcher.mock.calls[1][0]).toContain('111%2C222')
  })
  it('returns [] when the search has no hits', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ esearchresult: { idlist: [] } }) })
    expect(await fetchRecentPapers('내과', fetcher as any)).toEqual([])
  })
  it('throws on a failed search response', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(fetchRecentPapers('내과', fetcher as any)).rejects.toThrow()
  })
})

const PMC_XML = `<?xml version="1.0"?>
<pmc-articleset><article><body>
  <sec><title>Introduction</title><p>Flap survival matters.</p></sec>
  <sec><title>Methods</title><p>We reviewed 42 cases.</p><p>Statistics were used.</p></sec>
</body></article></pmc-articleset>`

describe('pmcid + filters', () => {
  it('extracts the pmcid when present', () => {
    const papers = parsePubmedArticles(XML)
    expect(papers[0].pmcid).toBe('PMC7654321')
    expect(papers[1].pmcid).toBeNull()
  })
  it('builds journal-scoped terms and date windows', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ esearchresult: { idlist: [] } }) })
    await fetchRecentPapers('성형외과', fetcher as any, { tas: ['Arch Plast Surg', 'Plast Reconstr Surg'], days: 7 })
    const url = fetcher.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent('"Arch Plast Surg"[ta]'))
    expect(url).toContain(encodeURIComponent(' OR '))
    expect(url).toContain('reldate=7')
    expect(url).toContain('datetype=pdat')
  })
})

describe('fetchPmcFullText', () => {
  it('joins section titles and paragraphs', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(PMC_XML) })
    const text = await fetchPmcFullText('PMC7654321', fetcher as any)
    expect(text).toContain('Introduction')
    expect(text).toContain('We reviewed 42 cases.')
    expect(fetcher.mock.calls[0][0]).toContain('db=pmc')
    expect(fetcher.mock.calls[0][0]).toContain('PMC7654321')
  })
  it('returns empty string when there is no body', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('<pmc-articleset/>') })
    expect(await fetchPmcFullText('PMC1', fetcher as any)).toBe('')
  })
})
