import { pubmedQueryFor, extractBodyText, type Paper } from './pubmed'
import { canonicalSpecialty } from '../mascot/roster'

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest'

export interface EpmcOptions {
  pageSize?: number
  days?: number
  tas?: string[]                    // journal filters
  sort?: 'date' | 'cited'           // server-side sort
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Europe PMC needs QUOTED phrases: an unquoted `anesthesiology OR pain medicine`
 * effectively matches bare "medicine" and floods results with unrelated papers.
 * Multi-word specialties get explicit quoted queries; the fallback quotes the
 * whole pubmed term as a phrase.
 */
const EPMC_QUERY: Record<string, string> = {
  성형외과: '"plastic surgery" OR "reconstructive surgery"',
  마취통증의학과: '"anesthesiology" OR "pain medicine"',
  내과: '"internal medicine"',
  정형외과: '"orthopedic surgery" OR "orthopaedic surgery"',
  외과: '"general surgery"',
  소아청소년과: '"pediatrics"',
  산부인과: '"obstetrics" OR "gynecology"',
  영상의학과: '"radiology"',
  응급의학과: '"emergency medicine"',
  가정의학과: '"family medicine"',
}

/** Europe PMC query: journal-scoped when tas given, else specialty terms; optional date window. */
export function epmcQueryFor(
  specialty: string | null | undefined,
  tas: string[],
  days: number | undefined,
): string {
  const term = EPMC_QUERY[canonicalSpecialty(specialty)] ?? `"${pubmedQueryFor(specialty)}"`
  const base = tas.length > 0
    ? `(${tas.map((t) => `JOURNAL:"${t}"`).join(' OR ')})`
    : `(${term})`
  const date = days ? ` AND FIRST_PDATE:[${isoDaysAgo(days)} TO ${new Date().toISOString().slice(0, 10)}]` : ''
  return `${base}${date}`
}

/** Search Europe PMC (covers PubMed/MED, PMC, preprints/PPR …) into Paper[]. */
export async function searchEuropePmc(
  specialty: string | null | undefined,
  fetcher: typeof fetch = fetch,
  opts: EpmcOptions = {},
): Promise<Paper[]> {
  const { pageSize = 12, days, tas = [], sort = 'date' } = opts
  const query = epmcQueryFor(specialty, tas, days)
  const sortParam = sort === 'cited' ? 'CITED desc' : 'P_PDATE_D desc'
  const url =
    `${EPMC}/search?query=${encodeURIComponent(query)}&format=json&resultType=core` +
    `&pageSize=${pageSize}&sort=${encodeURIComponent(sortParam)}`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`europepmc search failed: ${(res as Response).status}`)
  const data = await res.json()
  const hits: any[] = data.resultList?.result ?? []
  return hits.map((h) => ({
    pmid: h.pmid ?? h.id ?? '',
    pmcid: h.pmcid ?? null,
    title: h.title ?? '(제목 없음)',
    journal: h.journalInfo?.journal?.title ?? (h.source === 'PPR' ? '프리프린트' : ''),
    year: String(h.pubYear ?? ''),
    abstract: h.abstractText ?? '',
    url: h.doi ? `https://doi.org/${h.doi}` : `https://europepmc.org/article/${h.source}/${h.id}`,
    authors: h.authorString ?? '',
    citedByCount: h.citedByCount ?? 0,
    date: h.firstPublicationDate ?? undefined,
    src: h.source ?? 'MED',
  }))
}

/** OA full text via Europe PMC; '' when unavailable (caller falls back). */
export async function fetchEpmcFullText(pmcid: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(`${EPMC}/${encodeURIComponent(pmcid)}/fullTextXML`)
  if (!res.ok) return ''
  return extractBodyText(await res.text())
}
