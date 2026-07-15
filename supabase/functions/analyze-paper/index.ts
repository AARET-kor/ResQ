// Supabase Edge Function: analyze-paper
// Deploy: supabase functions deploy analyze-paper
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { title, abstract, specialty } = await req.json()
    if (!title || !abstract) {
      return Response.json({ error: 'title and abstract required' }, { status: 400, headers: CORS })
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content:
            `당신은 ${specialty ?? '의학'} 전공의를 돕는 논문 분석 비서입니다. ` +
            `다음 논문 초록을 한국어로 분석해주세요. 형식: ① 세 줄 요약 ② 연구 방법 ` +
            `③ 핵심 결과 ④ 임상적 의의 ⑤ 한계점. 간결하고 정확하게.\n\n` +
            `제목: ${title}\n\n초록:\n${abstract}`,
        }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return Response.json({ error: `anthropic ${res.status}: ${detail}` }, { status: 502, headers: CORS })
    }
    const data = await res.json()
    const analysis = data.content?.[0]?.text ?? ''
    return Response.json({ analysis }, { headers: CORS })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS })
  }
})
