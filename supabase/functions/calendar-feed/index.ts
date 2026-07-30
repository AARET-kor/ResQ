// Edge Function: calendar-feed — ICS subscription feed, token-authenticated.
// Deploy: supabase functions deploy calendar-feed --no-verify-jwt
// URL: {SUPABASE_URL}/functions/v1/calendar-feed?token=<profiles.ics_token>
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}
function utc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token')
  // ics_token is a UUID column; reject anything else outright so the token can
  // never smuggle extra PostgREST filters, and encode it defensively anyway.
  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('missing or invalid token', { status: 400 })
  }
  const base = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  const pRes = await fetch(
    `${base}/rest/v1/profiles?ics_token=eq.${encodeURIComponent(token)}&select=id`,
    { headers },
  )
  const profiles = await pRes.json()
  if (!Array.isArray(profiles) || profiles.length === 0) return new Response('not found', { status: 404 })
  const userId = profiles[0].id

  const [evRes, tdRes] = await Promise.all([
    fetch(
      `${base}/rest/v1/events?user_id=eq.${encodeURIComponent(userId)}` +
      '&deleted_at=is.null&select=id,title,starts_at,ends_at,location',
      { headers },
    ),
    fetch(
      `${base}/rest/v1/todos?user_id=eq.${encodeURIComponent(userId)}` +
      '&done=eq.false&deleted_at=is.null&select=id,title,due_date',
      { headers },
    ),
  ])
  const eventsRaw = await evRes.json()
  const todosRaw = await tdRes.json()
  const events = Array.isArray(eventsRaw) ? eventsRaw : []
  const todos = Array.isArray(todosRaw) ? todosRaw : []

  const now = utc(new Date().toISOString())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ResQ//KR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:ResQ']
  for (const e of events) {
    const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 3_600_000).toISOString()
    lines.push('BEGIN:VEVENT', `UID:resq-ev-${e.id}`, `DTSTAMP:${now}`,
      `DTSTART:${utc(e.starts_at)}`, `DTEND:${utc(end)}`, `SUMMARY:${esc(e.title)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:ResQ', 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT')
  }
  for (const t of todos) {
    if (!t.due_date) continue
    lines.push('BEGIN:VEVENT', `UID:resq-todo-${t.id}`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${t.due_date.replace(/-/g, '')}`, `SUMMARY:${esc(`[할일] ${t.title}`)}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'private, no-store',
      pragma: 'no-cache',
    },
  })
})
