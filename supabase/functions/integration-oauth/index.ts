// OAuth broker for linked external accounts.
//
// Deploy without gateway JWT verification because the provider callback has no
// Supabase token. The POST / start action authenticates its bearer token
// explicitly; callback state is single-use and expires after 10 minutes.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GRAPH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
  'Tasks.ReadWrite',
]

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS })
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes)
  crypto.getRandomValues(value)
  return base64Url(value)
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

function serviceHeaders(extra: HeadersInit = {}): Headers {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...Object.fromEntries(new Headers(extra)),
  })
}

async function database(path: string, init: RequestInit = {}): Promise<Response> {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) throw new Error('SERVER_CONFIG')
  return fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
  })
}

async function authenticatedUser(req: Request): Promise<{ id: string } | null> {
  const authorization = req.headers.get('authorization')
  const base = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization || !base || !anonKey) return null
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: { authorization, apikey: anonKey },
  })
  if (!response.ok) return null
  const user = await response.json()
  return typeof user?.id === 'string' ? { id: user.id } : null
}

function callbackUrl(): string {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) throw new Error('SERVER_CONFIG')
  return `${base}/functions/v1/integration-oauth/callback`
}

function safeReturnTo(req: Request, value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null
  if (value === 'com.resq.medical://integration/callback') return value
  try {
    const target = new URL(value)
    const requestOrigin = req.headers.get('origin')
    if (!requestOrigin || target.origin !== requestOrigin) return null
    if (target.protocol !== 'https:' && target.hostname !== 'localhost') return null
    return target.toString()
  } catch {
    return null
  }
}

function redirectResult(returnTo: string, result: string, reason?: string): Response {
  const target = new URL(returnTo)
  target.searchParams.set('integration', result)
  if (reason) target.searchParams.set('reason', reason.slice(0, 100))
  return Response.redirect(target.toString(), 302)
}

async function start(req: Request): Promise<Response> {
  const user = await authenticatedUser(req)
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: '올바른 요청이 아닙니다.' }, 400)
  }
  if (body.provider !== 'microsoft') {
    return json({ error: '지원하지 않는 연동 제공자입니다.' }, 400)
  }
  const returnTo = safeReturnTo(req, body.returnTo)
  if (!returnTo) return json({ error: '안전하지 않은 복귀 주소입니다.' }, 400)

  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({
      error: 'Microsoft OAuth 설정이 아직 완료되지 않았습니다.',
      code: 'MICROSOFT_OAUTH_NOT_CONFIGURED',
    }, 503)
  }

  const state = randomToken()
  const verifier = randomToken(48)
  const insert = await database('integration_oauth_states', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      state,
      user_id: user.id,
      provider: 'microsoft',
      code_verifier: verifier,
      return_to: returnTo,
    }),
  })
  if (!insert.ok) {
    console.error('oauth state insert failed', insert.status)
    return json({ error: 'Microsoft 연결을 준비하지 못했습니다.' }, 500)
  }

  const authorize = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('redirect_uri', callbackUrl())
  authorize.searchParams.set('response_mode', 'query')
  authorize.searchParams.set('scope', GRAPH_SCOPES.join(' '))
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('code_challenge', await pkceChallenge(verifier))
  authorize.searchParams.set('code_challenge_method', 'S256')
  authorize.searchParams.set('prompt', 'select_account')
  return json({ authorizationUrl: authorize.toString() })
}

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  if (!state || !/^[A-Za-z0-9_-]{20,200}$/.test(state)) {
    return new Response('invalid state', { status: 400 })
  }

  const stateResponse = await database(
    `integration_oauth_states?state=eq.${encodeURIComponent(state)}&select=*`,
  )
  const states = stateResponse.ok ? await stateResponse.json() : []
  const saved = Array.isArray(states) ? states[0] : null
  if (!saved || new Date(saved.expires_at).getTime() < Date.now()) {
    return new Response('expired state', { status: 400 })
  }

  await database(`integration_oauth_states?state=eq.${encodeURIComponent(state)}`, {
    method: 'DELETE',
  })

  const providerError = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  if (providerError || !code) {
    return redirectResult(saved.return_to, 'microsoft-error', providerError ?? 'missing_code')
  }

  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return redirectResult(saved.return_to, 'microsoft-error', 'server_config')
  }

  const tokenResponse = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(),
        scope: GRAPH_SCOPES.join(' '),
        code_verifier: saved.code_verifier,
      }),
    },
  )
  const tokens = await tokenResponse.json()
  if (!tokenResponse.ok || typeof tokens.access_token !== 'string') {
    console.error('microsoft token exchange failed', tokenResponse.status)
    return redirectResult(saved.return_to, 'microsoft-error', 'token_exchange')
  }

  const meResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const me = await meResponse.json()
  if (!meResponse.ok || typeof me.id !== 'string') {
    return redirectResult(saved.return_to, 'microsoft-error', 'profile')
  }

  const connectionResponse = await database(
    'integration_connections?on_conflict=user_id,provider,provider_account_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: saved.user_id,
        provider: 'microsoft',
        provider_account_id: me.id,
        account_email: me.mail ?? me.userPrincipalName ?? null,
        account_label: me.displayName ?? null,
        status: 'active',
        scopes: GRAPH_SCOPES,
        last_error: null,
      }),
    },
  )
  const connections = connectionResponse.ok ? await connectionResponse.json() : []
  const connection = Array.isArray(connections) ? connections[0] : null
  if (!connection?.id) {
    console.error('connection upsert failed', connectionResponse.status)
    return redirectResult(saved.return_to, 'microsoft-error', 'connection_store')
  }

  const credentialsResponse = await database(
    'integration_credentials?on_conflict=connection_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        connection_id: connection.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_type: tokens.token_type ?? 'Bearer',
        expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
        scope: tokens.scope ?? GRAPH_SCOPES.join(' '),
        updated_at: new Date().toISOString(),
      }),
    },
  )
  if (!credentialsResponse.ok) {
    console.error('credential upsert failed', credentialsResponse.status)
    return redirectResult(saved.return_to, 'microsoft-error', 'credential_store')
  }

  return redirectResult(saved.return_to, 'microsoft-connected')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const path = new URL(req.url).pathname
    if (req.method === 'GET' && path.endsWith('/callback')) return callback(req)
    if (req.method === 'POST') return start(req)
    return json({ error: 'method not allowed' }, 405)
  } catch (error) {
    console.error('integration-oauth failed', error instanceof Error ? error.message : error)
    return json({ error: '외부 계정 연결을 처리하지 못했습니다.' }, 500)
  }
})
