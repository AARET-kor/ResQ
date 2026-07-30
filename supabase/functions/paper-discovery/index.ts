// Authenticated scholarly discovery through OpenAlex.
// OPENALEX_API_KEY stays server-side. Metadata only; no paywalled PDF scraping.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENALEX = 'https://api.openalex.org'
const MAX_BODY_BYTES = 8_000
const TIMEOUT_MS = 15_000
const MAX_RESULTS = 12

const SPECIALTY_QUERY: Record<string, string> = {
  내과: 'internal medicine',
  정형외과: 'orthopedic surgery',
  외과: 'general surgery',
  성형외과: 'plastic reconstructive surgery',
  마취통증의학과: 'anesthesiology pain medicine',
  마취과: 'anesthesiology pain medicine',
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

interface DiscoveryBody {
  action?: unknown
  specialty?: unknown
  days?: unknown
  doi?: unknown
  pmid?: unknown
  openAlexId?: unknown
  title?: unknown
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: CORS })
}

async function authenticate(req: Request): Promise<boolean> {
  const authorization = req.headers.get('authorization')
  const base = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization || !base || !anonKey) return false
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: { authorization, apikey: anonKey },
  })
  return response.ok
}

async function readBody(req: Request): Promise<DiscoveryBody> {
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new Error('REQUEST_SIZE')
  const text = await req.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('REQUEST_SIZE')
  try {
    return JSON.parse(text) as DiscoveryBody
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function reconstructAbstract(index: unknown): string {
  if (typeof index !== 'object' || index === null) return ''
  const tokens: { word: string; position: number }[] = []
  for (const [word, positions] of Object.entries(index as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue
    for (const position of positions) {
      if (typeof position === 'number') tokens.push({ word, position })
    }
  }
  return tokens.sort((a, b) => a.position - b.position).map((token) => token.word).join(' ')
}

function externalId(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return value.split('/').at(-1) ?? null
}

function mapWork(work: Record<string, any>) {
  const doi = typeof work.doi === 'string'
    ? work.doi.replace(/^https?:\/\/doi\.org\//i, '')
    : null
  const openAlexId = externalId(work.id)
  const pmid = externalId(work.ids?.pmid) ?? openAlexId ?? doi ?? ''
  const isOpenAccess = Boolean(work.open_access?.is_oa)
  const oaUrl =
    work.best_oa_location?.landing_page_url ??
    work.best_oa_location?.pdf_url ??
    null
  const landingPage = work.primary_location?.landing_page_url
  const sourceName = work.primary_location?.source?.display_name ?? ''
  return {
    pmid,
    doi,
    openAlexId,
    pmcid: externalId(work.ids?.pmcid),
    title: work.display_name ?? work.title ?? '(제목 없음)',
    journal: sourceName,
    year: String(work.publication_year ?? ''),
    date: work.publication_date ?? undefined,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    url: doi ? `https://doi.org/${doi}` : landingPage ?? work.id,
    authors: Array.isArray(work.authorships)
      ? work.authorships
        .slice(0, 6)
        .map((entry: any) => entry.author?.display_name)
        .filter(Boolean)
        .join(', ')
      : '',
    citedByCount: Number(work.cited_by_count) || 0,
    src: 'OPENALEX',
    publicationTypes: work.type === 'review' ? ['Review'] : ['Journal Article'],
    isOpenAccess,
    oaUrl,
    isRetracted: Boolean(work.is_retracted),
    fwci: typeof work.fwci === 'number' ? work.fwci : null,
    sourceProvider: 'OpenAlex',
  }
}

async function openAlex(path: string, params: URLSearchParams): Promise<any> {
  const apiKey = Deno.env.get('OPENALEX_API_KEY')
  if (!apiKey) throw new Error('OPENALEX_CONFIG')
  params.set('api_key', apiKey)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${OPENALEX}${path}?${params}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`OPENALEX_${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function trending(body: DiscoveryBody) {
  const specialty = typeof body.specialty === 'string' ? body.specialty : ''
  const query = SPECIALTY_QUERY[specialty] ?? specialty
  if (!query || query.length > 100) throw new Error('INVALID_SPECIALTY')
  const days = Math.min(730, Math.max(30, Number(body.days) || 365))
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const params = new URLSearchParams({
    search: query,
    filter: `from_publication_date:${from},type:article|review,is_retracted:false,has_abstract:true`,
    sort: '-cited_by_count',
    per_page: String(MAX_RESULTS),
    select: [
      'id', 'doi', 'ids', 'display_name', 'publication_year', 'publication_date',
      'type', 'cited_by_count', 'is_retracted', 'fwci', 'open_access',
      'best_oa_location', 'primary_location', 'authorships', 'abstract_inverted_index',
    ].join(','),
  })
  const result = await openAlex('/works', params)
  return {
    papers: (result.results ?? []).map(mapWork).filter((paper: any) => paper.abstract),
    source: 'OpenAlex',
    costUsd: result.meta?.cost_usd ?? null,
  }
}

async function related(body: DiscoveryBody) {
  const doi = typeof body.doi === 'string' ? body.doi.slice(0, 300) : ''
  const pmid = typeof body.pmid === 'string' ? body.pmid.slice(0, 100) : ''
  const openAlexId = typeof body.openAlexId === 'string' ? body.openAlexId.slice(0, 100) : ''
  const title = typeof body.title === 'string' ? body.title.slice(0, 500) : ''
  const identifier = openAlexId
    ? openAlexId
    : doi
      ? `doi:${doi.replace(/^https?:\/\/doi\.org\//i, '')}`
      : pmid
        ? `pmid:${pmid}`
        : ''

  let relatedIds: string[] = []
  if (identifier) {
    try {
      const work = await openAlex(`/works/${encodeURIComponent(identifier)}`, new URLSearchParams({
        select: 'related_works',
      }))
      relatedIds = Array.isArray(work.related_works)
        ? work.related_works.map(externalId).filter(Boolean).slice(0, 30) as string[]
        : []
    } catch (error) {
      if (!title) throw error
    }
  }

  let result: any
  if (relatedIds.length > 0) {
    result = await openAlex('/works', new URLSearchParams({
      filter: `openalex:${relatedIds.join('|')},is_retracted:false,has_abstract:true`,
      sort: '-cited_by_count',
      per_page: String(MAX_RESULTS),
      select: [
        'id', 'doi', 'ids', 'display_name', 'publication_year', 'publication_date',
        'type', 'cited_by_count', 'is_retracted', 'fwci', 'open_access',
        'best_oa_location', 'primary_location', 'authorships', 'abstract_inverted_index',
      ].join(','),
    }))
  } else {
    if (!title) return { papers: [], source: 'OpenAlex', costUsd: null }
    result = await openAlex('/works', new URLSearchParams({
      search: title,
      filter: 'type:article|review,is_retracted:false,has_abstract:true',
      per_page: String(MAX_RESULTS),
      select: [
        'id', 'doi', 'ids', 'display_name', 'publication_year', 'publication_date',
        'type', 'cited_by_count', 'is_retracted', 'fwci', 'open_access',
        'best_oa_location', 'primary_location', 'authorships', 'abstract_inverted_index',
      ].join(','),
    }))
  }
  return {
    papers: (result.results ?? [])
      .map(mapWork)
      .filter((paper: any) => paper.abstract && paper.openAlexId !== openAlexId),
    source: 'OpenAlex',
    costUsd: result.meta?.cost_usd ?? null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  try {
    if (!await authenticate(req)) return json({ error: '로그인이 필요합니다.' }, 401)
    const body = await readBody(req)
    if (body.action === 'trending') return json(await trending(body))
    if (body.action === 'related') return json(await related(body))
    return json({ error: '지원하지 않는 논문 탐색 작업입니다.' }, 400)
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
        ? 'TIMEOUT'
        : error instanceof Error ? error.message : 'UNKNOWN'
    if (code === 'REQUEST_SIZE') return json({ error: '논문 탐색 요청이 너무 큽니다.' }, 413)
    if (code === 'INVALID_JSON') return json({ error: '올바른 JSON 요청이 아닙니다.' }, 400)
    if (code === 'OPENALEX_CONFIG') {
      return json({ error: 'OpenAlex API 키가 설정되지 않았습니다.' }, 503)
    }
    if (code === 'TIMEOUT') return json({ error: 'OpenAlex 응답 시간이 초과되었습니다.' }, 504)
    console.error('paper-discovery failed', code)
    return json({ error: 'OpenAlex 논문 탐색에 실패했습니다.' }, 502)
  }
})
