export interface Paper {
  pmid: string
  title: string
  journal: string
  year: string
  abstract: string
  url: string
}

/** 전공 → PubMed 검색어 (config). Unmapped → generic medicine. */
const SPECIALTY_QUERY: Record<string, string> = {
  내과: 'internal medicine',
  정형외과: 'orthopedic surgery',
  외과: 'general surgery',
  마취통증의학과: 'anesthesiology OR pain medicine',
  소아청소년과: 'pediatrics',
  산부인과: 'obstetrics gynecology',
  정신건강의학과: 'psychiatry',
  영상의학과: 'radiology',
  응급의학과: 'emergency medicine',
  신경과: 'neurology',
  신경외과: 'neurosurgery',
  피부과: 'dermatology',
  이비인후과: 'otolaryngology',
  안과: 'ophthalmology',
  비뇨의학과: 'urology',
  가정의학과: 'family medicine',
}

export function pubmedQueryFor(specialty: string | null | undefined): string {
  return SPECIALTY_QUERY[specialty ?? ''] ?? 'medicine'
}

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

export function parsePubmedArticles(xml: string): Paper[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return Array.from(doc.querySelectorAll('PubmedArticle')).map((a) => {
    const pmid = a.querySelector('PMID')?.textContent ?? ''
    const abstract = Array.from(a.querySelectorAll('AbstractText'))
      .map((n) => n.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
    return {
      pmid,
      title: a.querySelector('ArticleTitle')?.textContent ?? '(제목 없음)',
      journal: a.querySelector('Journal > Title')?.textContent ?? '',
      year: a.querySelector('PubDate > Year')?.textContent ?? '',
      abstract,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }
  })
}

/** Latest N papers for a specialty via E-utilities (CORS-enabled by NCBI). */
export async function fetchRecentPapers(
  specialty: string | null | undefined,
  fetcher: typeof fetch = fetch,
  retmax = 9,
): Promise<Paper[]> {
  const term = pubmedQueryFor(specialty)
  const searchUrl =
    `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=pub_date&retmax=${retmax}` +
    `&term=${encodeURIComponent(term)}`
  const sRes = await fetcher(searchUrl)
  if (!sRes.ok) throw new Error(`pubmed esearch failed: ${(sRes as Response).status}`)
  const sJson = await sRes.json()
  const ids: string[] = sJson.esearchresult?.idlist ?? []
  if (ids.length === 0) return []
  const fetchUrl = `${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id=${encodeURIComponent(ids.join(','))}`
  const fRes = await fetcher(fetchUrl)
  if (!fRes.ok) throw new Error(`pubmed efetch failed: ${(fRes as Response).status}`)
  return parsePubmedArticles(await fRes.text())
}
