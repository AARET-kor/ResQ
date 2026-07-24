import { pubmedQueryFor, extractBodyText, type Paper } from './pubmed'
import { canonicalSpecialty } from '../mascot/roster'
import { scorePaper } from './paperQuality'

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest'

export interface EpmcOptions {
  pageSize?: number
  days?: number
  tas?: string[]                    // journal filters
  sort?: 'date' | 'cited'           // server-side sort
  mode?: 'latest' | 'evidence' | 'trending' | 'open-access'
  requireSpecialty?: boolean        // combine journal filters with specialty terms
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
  성형외과: [
    'TITLE_ABS:"plastic surgery"',
    'TITLE_ABS:"reconstructive surgery"',
    '(TITLE_ABS:"microsurgery" AND (TITLE_ABS:reconstruct* OR TITLE_ABS:flap))',
    'TITLE_ABS:"free flap"',
    'TITLE_ABS:"rhinoplasty"',
    'TITLE_ABS:"craniofacial surgery"',
    'TITLE_ABS:"breast reconstruction"',
  ].join(' OR '),
  마취통증의학과: [
    'TITLE_ABS:"anesthesiology"',
    'TITLE_ABS:"pain medicine"',
    'TITLE_ABS:"perioperative medicine"',
    'TITLE_ABS:"regional anesthesia"',
  ].join(' OR '),
  내과: 'TITLE_ABS:"internal medicine"',
  정형외과: 'TITLE_ABS:"orthopedic surgery" OR TITLE_ABS:"orthopaedic surgery"',
  외과: 'TITLE_ABS:"general surgery"',
  소아청소년과: 'TITLE_ABS:"pediatrics"',
  산부인과: 'TITLE_ABS:"obstetrics" OR TITLE_ABS:"gynecology"',
  정신건강의학과: 'TITLE_ABS:"psychiatry"',
  영상의학과: 'TITLE_ABS:"radiology"',
  응급의학과: 'TITLE_ABS:"emergency medicine"',
  신경과: 'TITLE_ABS:"neurology"',
  신경외과: 'TITLE_ABS:"neurosurgery"',
  피부과: 'TITLE_ABS:"dermatology"',
  이비인후과: 'TITLE_ABS:"otolaryngology"',
  안과: 'TITLE_ABS:"ophthalmology"',
  비뇨의학과: 'TITLE_ABS:"urology"',
  가정의학과: 'TITLE_ABS:"family medicine"',
}

/** Europe PMC query: journal-scoped when tas given, else specialty terms; optional date window. */
export function epmcQueryFor(
  specialty: string | null | undefined,
  tas: string[],
  days: number | undefined,
  mode: EpmcOptions['mode'] = 'latest',
  requireSpecialty = false,
): string {
  const term = EPMC_QUERY[canonicalSpecialty(specialty)] ??
    `TITLE_ABS:"${pubmedQueryFor(specialty)}"`
  const journalTerm = tas.map((t) => `JOURNAL:"${t}"`).join(' OR ')
  const base = tas.length > 0
    ? requireSpecialty
      ? `((${journalTerm}) AND (${term}))`
      : `(${journalTerm})`
    : `(${term})`
  const date = days ? ` AND FIRST_PDATE:[${isoDaysAgo(days)} TO ${new Date().toISOString().slice(0, 10)}]` : ''
  const evidence = mode === 'evidence'
    ? ' AND (PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Practice Guideline" OR PUB_TYPE:"Guideline")'
    : ''
  const openAccess = mode === 'open-access' ? ' AND OPEN_ACCESS:Y' : ''
  return `${base} AND SRC:MED AND HAS_ABSTRACT:Y${date}${evidence}${openAccess}` +
    ' AND NOT (PUB_TYPE:"Editorial" OR PUB_TYPE:"Letter" OR PUB_TYPE:"Comment" OR PUB_TYPE:"Retracted Publication")'
}

/** Search Europe PMC (covers PubMed/MED, PMC, preprints/PPR …) into Paper[]. */
export async function searchEuropePmc(
  specialty: string | null | undefined,
  fetcher: typeof fetch = fetch,
  opts: EpmcOptions = {},
): Promise<Paper[]> {
  const {
    pageSize = 12,
    days,
    tas = [],
    sort = 'date',
    mode = 'latest',
    requireSpecialty = false,
  } = opts
  const query = epmcQueryFor(specialty, tas, days, mode, requireSpecialty)
  const sortParam = sort === 'cited' ? 'CITED desc' : 'P_PDATE_D desc'
  const url =
    `${EPMC}/search?query=${encodeURIComponent(query)}&format=json&resultType=core` +
    `&pageSize=${pageSize}&sort=${encodeURIComponent(sortParam)}`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`europepmc search failed: ${(res as Response).status}`)
  const data = await res.json()
  const hits: any[] = data.resultList?.result ?? []
  return hits.map((h) => {
    const pmcid = h.pmcid ?? null
    const doi = typeof h.doi === 'string' ? h.doi : null
    const publicationTypes: string[] = h.pubTypeList?.pubType ?? []
    return scorePaper({
      pmid: h.pmid ?? h.id ?? '',
      doi,
      pmcid,
      title: h.title ?? '(제목 없음)',
      journal: h.journalInfo?.journal?.title ?? (h.source === 'PPR' ? '프리프린트' : ''),
      year: String(h.pubYear ?? ''),
      abstract: h.abstractText ?? '',
      url: doi ? `https://doi.org/${doi}` : `https://europepmc.org/article/${h.source}/${h.id}`,
      authors: h.authorString ?? '',
      citedByCount: h.citedByCount ?? 0,
      date: h.firstPublicationDate ?? undefined,
      src: h.source ?? 'MED',
      publicationTypes,
      isOpenAccess: h.isOpenAccess === 'Y' || Boolean(pmcid),
      oaUrl: pmcid ? `https://europepmc.org/articles/${pmcid}` : null,
      isRetracted:
        h.isRetracted === 'Y' ||
        h.isWithdrawn === 'Y' ||
        publicationTypes.some((type) => /retract/i.test(type)),
      sourceProvider: 'Europe PMC',
    })
  })
}

/** OA full text via Europe PMC; '' when unavailable (caller falls back). */
export async function fetchEpmcFullText(pmcid: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(`${EPMC}/${encodeURIComponent(pmcid)}/fullTextXML`)
  if (!res.ok) return ''
  return extractBodyText(await res.text())
}
