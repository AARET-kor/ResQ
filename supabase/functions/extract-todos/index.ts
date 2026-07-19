// Edge Function: extract-todos — Claude turns a pasted memo/photo into todo items.
// Deploy: supabase functions deploy extract-todos
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { text, imageBase64, mediaType, specialty } = await req.json()
    if (!text && !imageBase64) {
      return Response.json({ todos: [] }, { headers: CORS })
    }
    const instruction =
      `${specialty ?? '의학'} 전공의의 메모/사진에서 실행 가능한 할일만 추출해 JSON으로 반환하세요. ` +
      `형식: {"todos":[{"title":string,"due_date":"YYYY-MM-DD"|null,"due_time":"HH:mm"|null,` +
      `"priority":"high"|"normal"|"low"}]} 마감이 불명확하면 null, 우선순위가 불명확하면 "normal". ` +
      `JSON 외 다른 텍스트 금지. 할일이 없으면 {"todos":[]}.`
    const content: unknown[] = imageBase64
      ? [
          { type: 'image', source: { type: 'base64', media_type: mediaType ?? 'image/png', data: imageBase64 } },
          { type: 'text', text: instruction },
        ]
      : [{ type: 'text', text: `${instruction}\n\n메모:\n${text}` }]
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
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return Response.json({ error: `anthropic ${res.status}: ${detail}` }, { status: 502, headers: CORS })
    }
    const data = await res.json()
    const raw: string = data.content?.[0]?.text ?? '{"todos":[]}'
    const jsonText = raw.replace(/^```(json)?/m, '').replace(/```$/m, '').trim()
    let todos: unknown[] = []
    try { todos = JSON.parse(jsonText).todos ?? [] } catch { todos = [] }
    return Response.json({ todos }, { headers: CORS })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: CORS })
  }
})
