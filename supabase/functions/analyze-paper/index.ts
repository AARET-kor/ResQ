// Supabase Edge Function: analyze-paper (v2 — abstract | report modes)
// Deploy: supabase functions deploy analyze-paper
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REPORT_FORMAT = `형식(각 섹션마다 한국어 본문을 먼저 쓰고, 바로 아래 "EN:"으로 시작하는 간결한 영어 요약을 병기):
## 요약 (3줄)
## 연구 배경
## 방법
## 핵심 결과 (수치 포함)
## 고찰 및 임상적 의의
## 한계
## 전공의 관점 포인트 (실전에서 기억할 것)`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { title, abstract, fulltext, pdfBase64, specialty, mode } = await req.json()
    if (!title) return Response.json({ error: 'title required' }, { status: 400, headers: CORS })

    const role = `당신은 ${specialty ?? '의학'} 전공의를 돕는 논문 분석 비서입니다.`
    let content: unknown[]
    if (mode === 'report' && pdfBase64) {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: `${role} 첨부된 논문 전체를 정독하고 아래 형식의 리포트를 작성하세요.\n${REPORT_FORMAT}\n\n제목: ${title}` },
      ]
    } else if (mode === 'report' && fulltext) {
      content = [{
        type: 'text',
        text: `${role} 아래 논문 전문을 정독하고 아래 형식의 리포트를 작성하세요.\n${REPORT_FORMAT}\n\n제목: ${title}\n\n본문:\n${fulltext}`,
      }]
    } else {
      if (!abstract) return Response.json({ error: 'abstract required' }, { status: 400, headers: CORS })
      content = [{
        type: 'text',
        text: `${role} 다음 논문 초록을 한국어로 분석해주세요. 형식: ① 세 줄 요약 ② 연구 방법 ③ 핵심 결과 ④ 임상적 의의 ⑤ 한계점. 간결하고 정확하게.\n\n제목: ${title}\n\n초록:\n${abstract}`,
      }]
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
        max_tokens: mode === 'report' ? 4000 : 1500,
        messages: [{ role: 'user', content }],
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
