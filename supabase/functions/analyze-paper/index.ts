// Supabase Edge Function: analyze-paper with bounded input, timeout,
// per-user idempotency/cache, and usage logging.
// Deploy after applying migration 0010_ai_request_controls.sql.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_TITLE_CHARS = 500
const MAX_ABSTRACT_CHARS = 150_000
const MAX_FULLTEXT_CHARS = 1_000_000
const MAX_PDF_MEGABYTES = 50
const MAX_PDF_BYTES = MAX_PDF_MEGABYTES * 1024 * 1024
const MAX_PDF_BASE64_CHARS = Math.ceil(MAX_PDF_BYTES / 3) * 4 + 8
const MAX_PDF_PAGES = 400
const MAX_SPECIALTY_CHARS = 100
const MAX_REQUEST_BODY_BYTES = MAX_PDF_BASE64_CHARS + 1_500_000
const ANTHROPIC_TIMEOUT_MS = 275_000

const BREAKDOWN_FORMAT = `다음 8개 섹션을 빠짐없이 작성하세요.
## 1. 서지정보와 연구 유형
## 2. 임상 질문 · PICO/PECO
## 3. 배경과 기존 연구의 공백
## 4. 연구 설계 · 대상 · 중재/노출 · 비교군
## 5. 평가변수와 통계 방법
## 6. 핵심 결과 · 효과크기 · 신뢰구간
## 7. 비뚤림 위험 · 한계 · 근거 확실성
## 8. 임상 적용성과 후속 질문

규칙:
- 원문에 없는 수치, 표본수, 인용문헌은 만들지 마세요.
- 각 핵심 주장 뒤에 [초록], [방법], [결과], [고찰]처럼 근거 위치를 표시하세요.
- 초록만 제공되었다면 확인할 수 없는 항목을 "초록만으로 확인 불가"라고 명시하세요.
- 관찰된 사실과 해석을 구분하고, 진료 지침이나 의학적 조언처럼 단정하지 마세요.
- 각 섹션은 한국어로 작성하고 마지막 줄에 "EN:"으로 시작하는 한 문장 요약을 병기하세요.`

const IDEATION_FORMAT = `이 논문에서 직접 확인되는 내용만 출발점으로 삼아 연구 아이디에이션 문서를 작성하세요.
## 출발 근거
- 논문이 답한 질문, 남긴 공백, 확인 가능한 한계를 구분
## 검증 가능한 가설 3개
- 각 가설의 독립변수·종속변수·예상 방향
## 연구 설계 후보 3개
- 각 설계의 PICO/PECO, 주요·보조 평가변수, 대상군, 비교군
## 데이터와 실행 가능성
- 필요한 데이터, 표본수 산정에 필요한 입력값, 예상 교란변수, 결측·편향 위험
## 신규성 및 임상 가치
- 무엇이 새롭고 어떤 의사결정에 기여하는지
## 윤리·안전·실패 기준
- IRB/동의/개인정보 이슈와 가설을 기각할 기준
## 다음 단계
- 먼저 확인할 연관 논문 검색어 5개와 파일럿 실행 순서

규칙:
- "논문에서 확인된 사실"과 "제안/가설"을 명시적으로 구분하세요.
- 존재하지 않는 선행연구나 참고문헌을 만들지 마세요.
- 표본수나 효과크기는 근거가 없으면 숫자를 임의로 제시하지 말고 필요한 산정 항목을 쓰세요.
- 진료 의사결정이 아닌 연구 기획 보조 자료임을 마지막에 밝히세요.`

type Operation = 'abstract' | 'fulltext' | 'pdf'
type AnalysisMode = 'breakdown' | 'report' | 'ideation'

interface AnalyzeRequest {
  title?: unknown
  abstract?: unknown
  fulltext?: unknown
  pdfBase64?: unknown
  pdfMediaType?: unknown
  specialty?: unknown
  mode?: unknown
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS })
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function readJsonBounded(req: Request): Promise<AnalyzeRequest> {
  const declaredLength = Number(req.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_REQUEST_BODY_BYTES) throw new Error('REQUEST_SIZE')
  if (!req.body) throw new Error('INVALID_JSON')

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel()
      throw new Error('REQUEST_SIZE')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as AnalyzeRequest
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function validatePdf(pdfBase64: string, mediaType: string): { bytes: number; pages: number } {
  if (mediaType !== 'application/pdf') throw new Error('PDF_MIME')
  if (pdfBase64.length === 0 || pdfBase64.length > MAX_PDF_BASE64_CHARS) throw new Error('PDF_SIZE')

  let binary: string
  try {
    binary = atob(pdfBase64)
  } catch {
    throw new Error('PDF_BASE64')
  }
  if (!binary.startsWith('%PDF-')) throw new Error('PDF_SIGNATURE')
  if (binary.length > MAX_PDF_BYTES) throw new Error('PDF_SIZE')

  // PDF page objects are directly countable in most regular PDFs. Object-stream
  // PDFs may report zero here; the byte cap still bounds those inputs.
  const pages = binary.match(/\/Type\s*\/Page\b/g)?.length ?? 0
  if (pages > MAX_PDF_PAGES) throw new Error('PDF_PAGES')
  return { bytes: binary.length, pages }
}

async function rpc(
  req: Request,
  functionName: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const authorization = req.headers.get('authorization')
  if (!authorization) return new Response('authentication required', { status: 401 })
  const base = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!base || !anonKey) return new Response('server configuration error', { status: 500 })
  return fetch(`${base}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function complete(
  req: Request,
  requestHash: string,
  status: 'completed' | 'failed',
  values: {
    response?: string
    inputTokens?: number
    outputTokens?: number
    errorCode?: string
  } = {},
): Promise<void> {
  const result = await rpc(req, 'complete_ai_request', {
    p_request_hash: requestHash,
    p_status: status,
    p_response: values.response ?? null,
    p_input_tokens: values.inputTokens ?? null,
    p_output_tokens: values.outputTokens ?? null,
    p_error_code: values.errorCode ?? null,
  })
  if (!result.ok) console.error('complete_ai_request failed', result.status)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let requestHash: string | null = null
  try {
    const body = await readJsonBounded(req)
    const title = stringValue(body.title).trim()
    const abstract = stringValue(body.abstract)
    const fulltext = stringValue(body.fulltext)
    const pdfBase64 = stringValue(body.pdfBase64)
    const pdfMediaType = stringValue(body.pdfMediaType)
    const specialty = stringValue(body.specialty) || '의학'
    const mode: AnalysisMode =
      body.mode === 'report' ? 'report' : body.mode === 'ideation' ? 'ideation' : 'breakdown'
    const reportMode = mode === 'report'

    if (!title) return json({ error: '제목이 필요합니다.' }, 400)
    if (title.length > MAX_TITLE_CHARS) return json({ error: `제목은 ${MAX_TITLE_CHARS}자 이하여야 합니다.` }, 413)
    if (abstract.length > MAX_ABSTRACT_CHARS) return json({ error: '초록이 너무 깁니다.' }, 413)
    if (specialty.length > MAX_SPECIALTY_CHARS) return json({ error: '전공 정보가 너무 깁니다.' }, 413)
    if (fulltext.length > MAX_FULLTEXT_CHARS) {
      return json({ error: `전문은 ${MAX_FULLTEXT_CHARS.toLocaleString()}자 이하여야 합니다.` }, 413)
    }

    let operation: Operation = 'abstract'
    let inputBytes = byteLength(title) + byteLength(abstract) + byteLength(specialty)
    let pdfPages = 0
    if (reportMode && pdfBase64) {
      operation = 'pdf'
      const pdf = validatePdf(pdfBase64, pdfMediaType)
      inputBytes += pdf.bytes
      pdfPages = pdf.pages
    } else if (reportMode && fulltext) {
      operation = 'fulltext'
      inputBytes += byteLength(fulltext)
    } else if (!abstract) {
      return json({ error: '초록이 필요합니다.' }, 400)
    }

    requestHash = await sha256(JSON.stringify({
      version: 2,
      mode,
      operation,
      title,
      abstract,
      fulltext,
      pdfBase64,
      specialty,
    }))

    const claimResponse = await rpc(req, 'claim_ai_request', {
      p_request_hash: requestHash,
      p_operation: operation,
      p_input_bytes: inputBytes,
    })
    if (claimResponse.status === 401) return json({ error: '로그인이 필요합니다.' }, 401)
    if (!claimResponse.ok) {
      console.error('claim_ai_request failed', claimResponse.status)
      return json({ error: 'AI 요청 제어 설정이 필요합니다. 마이그레이션 0010을 적용해주세요.' }, 503)
    }
    const claimRows = await claimResponse.json()
    const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows
    if (!claim?.claimed) {
      if (claim?.cache_status === 'completed' && claim?.cached_response) {
        return json({ analysis: claim.cached_response, cached: true })
      }
      return json({ error: '동일한 분석 요청이 이미 처리 중입니다. 잠시 후 다시 열어주세요.' }, 409)
    }

    const role = `당신은 ${specialty} 전공의를 돕는 논문 분석 비서입니다.`
    let content: unknown[]
    if (operation === 'pdf') {
      content = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        {
          type: 'text',
          text: `${role} 첨부된 논문 전체를 정독하고 아래 형식의 리포트를 작성하세요. PDF에서 페이지를 식별할 수 있을 때만 [p. 12]처럼 함께 표시하세요.\n${BREAKDOWN_FORMAT}\n\n제목: ${title}`,
        },
      ]
    } else if (operation === 'fulltext') {
      content = [{
        type: 'text',
        text: `${role} 아래 논문 전문을 정독하고 아래 형식의 리포트를 작성하세요.\n${BREAKDOWN_FORMAT}\n\n제목: ${title}\n\n본문:\n${fulltext}`,
      }]
    } else if (mode === 'ideation') {
      content = [{
        type: 'text',
        text: `${role} 아래 논문 초록을 바탕으로 연구 아이디에이션을 작성하세요.\n${IDEATION_FORMAT}\n\n제목: ${title}\n\n초록:\n${abstract}`,
      }]
    } else {
      content = [{
        type: 'text',
        text: `${role} 다음 논문 초록을 구조적으로 분석하세요.\n${BREAKDOWN_FORMAT}\n\n제목: ${title}\n\n초록:\n${abstract}`,
      }]
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS)
    let anthropicResponse: Response
    try {
      anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: mode === 'ideation' ? 12_500 : operation === 'abstract' ? 11_000 : 20_000,
          messages: [{ role: 'user', content }],
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!anthropicResponse.ok) {
      await complete(req, requestHash, 'failed', { errorCode: `ANTHROPIC_${anthropicResponse.status}` })
      console.error('Anthropic request failed', anthropicResponse.status)
      return json({ error: 'AI 분석 서비스가 응답하지 않았습니다. 잠시 후 다시 시도해주세요.' }, 502)
    }

    const data = await anthropicResponse.json()
    const analysis = stringValue(data.content?.[0]?.text)
    if (!analysis) {
      await complete(req, requestHash, 'failed', { errorCode: 'EMPTY_RESPONSE' })
      return json({ error: 'AI 분석 결과가 비어 있습니다. 다시 시도해주세요.' }, 502)
    }
    await complete(req, requestHash, 'completed', {
      response: analysis,
      inputTokens: Number(data.usage?.input_tokens) || undefined,
      outputTokens: Number(data.usage?.output_tokens) || undefined,
    })
    return json({ analysis, cached: false, limits: { pdfPages } })
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
        ? 'AbortError'
        : error instanceof Error
          ? error.message
          : 'UNKNOWN'
    if (requestHash) await complete(req, requestHash, 'failed', { errorCode: code })
    if (code === 'AbortError') return json({ error: 'AI 분석 시간이 초과되었습니다. 다시 시도해주세요.' }, 504)
    if (code === 'REQUEST_SIZE') return json({ error: 'AI 분석 요청 본문이 너무 큽니다.' }, 413)
    if (code === 'INVALID_JSON') return json({ error: '올바른 JSON 요청이 아닙니다.' }, 400)
    if (code === 'PDF_MIME') return json({ error: 'application/pdf 형식만 업로드할 수 있습니다.' }, 415)
    if (code === 'PDF_SIZE') {
      return json({ error: `PDF는 ${MAX_PDF_MEGABYTES}MB 이하만 업로드할 수 있습니다.` }, 413)
    }
    if (code === 'PDF_PAGES') return json({ error: `PDF는 ${MAX_PDF_PAGES}페이지 이하여야 합니다.` }, 413)
    if (code === 'PDF_BASE64' || code === 'PDF_SIGNATURE') return json({ error: '올바른 PDF 파일이 아닙니다.' }, 400)
    console.error('analyze-paper failed', code)
    return json({ error: 'AI 분석 요청을 처리하지 못했습니다.' }, 500)
  }
})
