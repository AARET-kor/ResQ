// Backward-compatible endpoint for older ResQ clients. All analysis is routed
// through extract-planner-items so legacy todo extraction inherits the same
// authentication, request limits, MIME checks, timeout, duplicate lock and
// usage ledger. No model provider error body is exposed to the browser.
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'private, no-store',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: HEADERS })
  if (req.method !== 'POST') {
    return Response.json(
      { error: 'method not allowed' },
      { status: 405, headers: HEADERS },
    )
  }

  const authorization = req.headers.get('authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization) {
    return Response.json(
      { error: '로그인이 필요합니다.' },
      { status: 401, headers: HEADERS },
    )
  }
  if (!supabaseUrl || !anonKey) {
    return Response.json(
      { error: '서버 설정을 확인해주세요.' },
      { status: 500, headers: HEADERS },
    )
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/extract-planner-items`,
      {
        method: 'POST',
        headers: {
          apikey: req.headers.get('apikey') ?? anonKey,
          authorization,
          'content-type': req.headers.get('content-type')
            ?? 'application/json',
        },
        body: req.body,
      },
    )
    return new Response(response.body, {
      status: response.status,
      headers: {
        ...HEADERS,
        'content-type':
          response.headers.get('content-type') ?? 'application/json',
      },
    })
  } catch {
    return Response.json(
      { error: '메모·사진 분석 서버에 연결할 수 없습니다.' },
      { status: 502, headers: HEADERS },
    )
  }
})
