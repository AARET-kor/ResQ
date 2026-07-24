// Legal full-text discovery. Sci-Hub 등 무단 배포망은 연동하지 않는다
// (docs/paper-discovery.md 원문 접근 정책). Unpaywall은 출판사·리포지터리의
// 합법 OA 사본 위치만 알려주는 공식 API다.
const UNPAYWALL = 'https://api.unpaywall.org/v2'
// Unpaywall requires a contact email query param (their only "auth").
const CONTACT = 'resq-app@users.noreply.github.com'

export interface OaCopy {
  url: string
  version: string | null   // publishedVersion | acceptedVersion | submittedVersion
  license: string | null
}

/** Find a LEGAL open-access copy for a DOI via Unpaywall; null when none. */
export async function findOaCopy(
  doi: string,
  fetcher: typeof fetch = fetch,
): Promise<OaCopy | null> {
  const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim()
  if (!clean) return null
  const res = await fetcher(`${UNPAYWALL}/${encodeURIComponent(clean)}?email=${CONTACT}`)
  if ((res as Response).status === 404) return null
  if (!res.ok) throw new Error(`unpaywall failed: ${(res as Response).status}`)
  const data = await res.json()
  const loc = data.best_oa_location ?? null
  const url: string | null = loc?.url_for_pdf ?? loc?.url ?? null
  if (!data.is_oa || !url) return null
  return { url, version: loc?.version ?? null, license: loc?.license ?? null }
}

/** Google Scholar has no API and forbids scraping — deep links only. */
export function scholarSearchUrl(query: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`
}
