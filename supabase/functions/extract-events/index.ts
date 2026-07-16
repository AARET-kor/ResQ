// Edge Function: extract-events — Claude parses schedule emails into events JSON.
// Deploy: supabase functions deploy extract-events (ANTHROPIC_API_KEY secret shared)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { emails, specialty } = await req.json()
    if (!Array.isArray(emails) || emails.length === 0) {
      return Response.json({ events: [] }, { headers: CORS })
    }
    const digest = emails
      .map((e: { subject: string; body: string }, i: number) => `[메일 ${i + 1}] 제목: ${e.subject}\n${e.body}`)
      .join('\n\n---\n\n')
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content:
            `${specialty ?? '의학'} 전공의의 메일에서 실제 일정(학회/학술대회/행사/교수님 일정/회식 등)만 추출해 ` +
            `JSON으로 반환하세요. 확실한 날짜가 있는 것만. 연도가 없으면 가장 가까운 미래로 해석. ` +
            `형식: {"events":[{"title":string,"starts_at":"YYYY-MM-DDTHH:mm:00+09:00","ends_at":string|null,` +
            `"location":string|null,"kind":"conference"|"surgery"|"social"|"professor"|"other"}]} ` +
            `JSON 외 다른 텍스트 금지. 일정이 없으면 {"events":[]}.\n\n${digest}`,
        }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return Response.json({ error: `anthropic ${res.status}: ${detail}` }, { status: 502, headers: CORS })
    }
    const data = await res.json()
    const raw: string = data.content?.[0]?.text ?? '{"events":[]}'
    const jsonText = raw.replace(/^```(json)?/m, '').replace(/```$/m, '').trim()
    let events: unknown[] = []
    try {
      events = JSON.parse(jsonText).events ?? []
    } catch {
      events = []
    }
    return Response.json({ events }, { headers: CORS })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS })
  }
})
