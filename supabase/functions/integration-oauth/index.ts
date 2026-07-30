// Server-side OAuth broker and credential configuration for calendar/task
// providers. Deploy without gateway JWT verification: callbacks have no
// Supabase token, while every state-changing POST authenticates explicitly.
import {
  CORS,
  authenticatedUser,
  database,
  dbRows,
  dbWrite,
  json,
  readCredentials,
  storeCredentials,
  validateRemoteHttpsUrl,
  type JsonRecord,
} from '../_shared/integration.ts'

type OAuthProvider = 'google' | 'microsoft' | 'todoist'

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
]

const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
  'Tasks.ReadWrite',
]

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
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

async function stableId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64Url(new Uint8Array(digest)).slice(0, 32)
}

function callbackUrl(): string {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) throw new Error('SERVER_CONFIG')
  return `${base}/functions/v1/integration-oauth/callback`
}

function safeReturnTo(req: Request, value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null
  if (
    value === 'com.resq.medical://integration/callback'
    || value === 'resq://integration/callback'
  ) return value
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

function redirectResult(
  returnTo: string,
  provider: string,
  succeeded: boolean,
  reason?: string,
): Response {
  const target = new URL(returnTo)
  target.searchParams.set('integration', `${provider}-${succeeded ? 'connected' : 'error'}`)
  if (reason) target.searchParams.set('reason', reason.slice(0, 100))
  return Response.redirect(target.toString(), 302)
}

function providerConfigured(provider: OAuthProvider): boolean {
  const encrypted = Boolean(Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY'))
  if (provider === 'google') {
    return encrypted
      && Boolean(Deno.env.get('GOOGLE_OAUTH_CLIENT_ID'))
      && Boolean(Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET'))
  }
  if (provider === 'microsoft') {
    return encrypted
      && Boolean(Deno.env.get('MICROSOFT_CLIENT_ID'))
      && Boolean(Deno.env.get('MICROSOFT_CLIENT_SECRET'))
  }
  return encrypted
    && Boolean(Deno.env.get('TODOIST_CLIENT_ID'))
    && Boolean(Deno.env.get('TODOIST_CLIENT_SECRET'))
}

function capabilities(): Response {
  return json({
    google: providerConfigured('google'),
    microsoft: providerConfigured('microsoft'),
    todoist: providerConfigured('todoist'),
    ics: true,
    caldav: Boolean(Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY')),
  })
}

function oauthConfig(provider: OAuthProvider): {
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
} | null {
  if (!providerConfigured(provider)) return null
  if (provider === 'google') {
    return {
      clientId: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
      clientSecret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: GOOGLE_SCOPES,
    }
  }
  if (provider === 'microsoft') {
    return {
      clientId: Deno.env.get('MICROSOFT_CLIENT_ID')!,
      clientSecret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
      authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: MICROSOFT_SCOPES,
    }
  }
  return {
    clientId: Deno.env.get('TODOIST_CLIENT_ID')!,
    clientSecret: Deno.env.get('TODOIST_CLIENT_SECRET')!,
    authorizeUrl: 'https://app.todoist.com/oauth/authorize',
    tokenUrl: 'https://api.todoist.com/oauth/access_token',
    scopes: ['data:read_write'],
  }
}

async function startOAuth(
  req: Request,
  user: { id: string },
  body: JsonRecord,
): Promise<Response> {
  const provider = body.provider as OAuthProvider
  if (!['google', 'microsoft', 'todoist'].includes(provider)) {
    return json({ error: '지원하지 않는 OAuth 제공자입니다.' }, 400)
  }
  const returnTo = safeReturnTo(req, body.returnTo)
  if (!returnTo) return json({ error: '안전하지 않은 복귀 주소입니다.' }, 400)
  const config = oauthConfig(provider)
  if (!config) {
    return json({
      error: `${provider} OAuth 설정이 아직 완료되지 않았습니다.`,
      code: `${provider.toUpperCase()}_OAUTH_NOT_CONFIGURED`,
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
      provider,
      code_verifier: verifier,
      return_to: returnTo,
    }),
  })
  if (!insert.ok) {
    console.error('oauth state insert failed', insert.status)
    return json({ error: '외부 계정 연결을 준비하지 못했습니다.' }, 500)
  }

  const authorize = new URL(config.authorizeUrl)
  authorize.searchParams.set('client_id', config.clientId)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('redirect_uri', callbackUrl())
  authorize.searchParams.set(
    'scope',
    provider === 'todoist' ? config.scopes.join(',') : config.scopes.join(' '),
  )
  authorize.searchParams.set('state', state)
  // Google and Microsoft support PKCE for confidential web clients. Todoist's
  // pre-registered confidential-client flow uses the client secret instead;
  // PKCE is reserved for its public/metadata-client flow.
  if (provider !== 'todoist') {
    authorize.searchParams.set('code_challenge', await pkceChallenge(verifier))
    authorize.searchParams.set('code_challenge_method', 'S256')
  }
  if (provider === 'google') {
    authorize.searchParams.set('access_type', 'offline')
    authorize.searchParams.set('include_granted_scopes', 'true')
    authorize.searchParams.set('prompt', 'consent')
  } else if (provider === 'microsoft') {
    authorize.searchParams.set('response_mode', 'query')
    authorize.searchParams.set('prompt', 'select_account')
  }
  return json({ authorizationUrl: authorize.toString() })
}

async function exchangeCode(
  provider: OAuthProvider,
  code: string,
  verifier: string,
): Promise<JsonRecord> {
  const config = oauthConfig(provider)
  if (!config) throw new Error('SERVER_CONFIG')
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: callbackUrl(),
  })
  if (provider !== 'todoist') form.set('code_verifier', verifier)
  if (provider !== 'todoist') {
    form.set('grant_type', 'authorization_code')
  }
  if (provider === 'microsoft') form.set('scope', config.scopes.join(' '))
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const tokens = await response.json()
  if (!response.ok || typeof tokens.access_token !== 'string') {
    console.error(`${provider} token exchange failed`, response.status)
    throw new Error('TOKEN_EXCHANGE')
  }
  return tokens
}

async function providerProfile(
  provider: OAuthProvider,
  accessToken: string,
): Promise<{
  id: string
  email: string | null
  label: string | null
}> {
  const url = provider === 'google'
    ? 'https://www.googleapis.com/oauth2/v2/userinfo'
    : provider === 'microsoft'
      ? 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName'
      : 'https://api.todoist.com/api/v1/user'
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const profile = await response.json()
  if (!response.ok) throw new Error('PROFILE')
  const id = String(profile.id ?? profile.sub ?? '')
  if (!id) throw new Error('PROFILE')
  if (provider === 'microsoft') {
    return {
      id,
      email: profile.mail ?? profile.userPrincipalName ?? null,
      label: profile.displayName ?? null,
    }
  }
  return {
    id,
    email: profile.email ?? null,
    label: profile.name ?? profile.full_name ?? profile.email ?? null,
  }
}

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  if (!state || !/^[A-Za-z0-9_-]{20,200}$/.test(state)) {
    return new Response('invalid state', { status: 400 })
  }
  const states = await dbRows(
    `integration_oauth_states?state=eq.${encodeURIComponent(state)}&select=*`,
  )
  const saved = states[0]
  if (!saved || new Date(saved.expires_at).getTime() < Date.now()) {
    return new Response('expired state', { status: 400 })
  }
  await dbWrite(
    `integration_oauth_states?state=eq.${encodeURIComponent(state)}`,
    'DELETE',
  )

  const provider = saved.provider as OAuthProvider
  const providerError = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  if (providerError || !code) {
    return redirectResult(saved.return_to, provider, false, providerError ?? 'missing_code')
  }

  try {
    const tokens = await exchangeCode(provider, code, saved.code_verifier)
    const profile = await providerProfile(provider, tokens.access_token)
    const config = oauthConfig(provider)!
    const connections = await dbWrite(
      'integration_connections?on_conflict=user_id,provider,provider_account_id',
      'POST',
      {
        user_id: saved.user_id,
        provider,
        provider_account_id: profile.id,
        account_email: profile.email,
        account_label: profile.label,
        status: 'active',
        scopes: provider === 'todoist' ? ['data:read_write'] : config.scopes,
        sync_mode: 'two_way',
        last_error: null,
      },
      'resolution=merge-duplicates,return=representation',
    )
    const connection = connections[0]
    if (!connection?.id) throw new Error('CONNECTION_STORE')
    const existing = await readCredentials(connection.id)
    await storeCredentials(connection.id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? null,
      token_type: tokens.token_type ?? 'Bearer',
      expires_at: tokens.expires_in
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
        : null,
      scope: tokens.scope ?? config.scopes.join(' '),
    })
    return redirectResult(saved.return_to, provider, true)
  } catch (error) {
    console.error(`${provider} oauth callback failed`, error instanceof Error ? error.message : error)
    return redirectResult(saved.return_to, provider, false, 'callback')
  }
}

async function configureDirect(
  user: { id: string },
  body: JsonRecord,
): Promise<Response> {
  const provider = body.provider
  if (provider !== 'ics' && provider !== 'caldav') {
    return json({ error: '지원하지 않는 직접 연결입니다.' }, 400)
  }
  const endpoint = validateRemoteHttpsUrl(body.endpointUrl)
  if (!endpoint) return json({ error: '공개 HTTPS 주소만 연결할 수 있습니다.' }, 400)
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 320) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (provider === 'caldav' && (!username || !password)) {
    return json({ error: 'CalDAV 사용자 이름과 앱 비밀번호가 필요합니다.' }, 400)
  }
  const label = typeof body.label === 'string' && body.label.trim()
    ? body.label.trim().slice(0, 120)
    : provider === 'ics' ? 'ICS 구독' : endpoint.hostname
  const providerAccountId = await stableId(
    `${provider}:${endpoint.toString()}:${username}`,
  )
  const connections = await dbWrite(
    'integration_connections?on_conflict=user_id,provider,provider_account_id',
    'POST',
    {
      user_id: user.id,
      provider,
      provider_account_id: providerAccountId,
      account_label: label,
      status: 'active',
      scopes: provider === 'ics' ? ['calendar.read'] : ['calendar.read', 'calendar.write'],
      sync_mode: provider === 'ics' ? 'read_only' : 'two_way',
      last_error: null,
    },
    'resolution=merge-duplicates,return=representation',
  )
  const connection = connections[0]
  if (!connection?.id) return json({ error: '연결 정보를 저장하지 못했습니다.' }, 500)
  await storeCredentials(connection.id, {
    access_token: provider === 'caldav' ? password : '-',
    endpoint_url: endpoint.toString(),
    username: username || null,
    token_type: provider === 'caldav' ? 'Basic' : 'Feed',
  })
  if (provider === 'ics') {
    await dbWrite(
      'integration_sources?on_conflict=user_id,provider,resource_type,external_id',
      'POST',
      [
        {
          user_id: user.id,
          connection_id: connection.id,
          provider: 'ics',
          resource_type: 'calendar',
          external_id: providerAccountId,
          name: label,
          selected: true,
          is_default: true,
          can_write: false,
          sync_mode: 'read_only',
        },
        {
          user_id: user.id,
          connection_id: connection.id,
          provider: 'ics',
          resource_type: 'task_list',
          external_id: providerAccountId,
          name: `${label} · Tasks`,
          selected: true,
          is_default: true,
          can_write: false,
          sync_mode: 'read_only',
        },
      ],
      'resolution=merge-duplicates,return=minimal',
    )
  }
  return json({ connection })
}

async function disconnect(user: { id: string }, body: JsonRecord): Promise<Response> {
  if (typeof body.connectionId !== 'string') {
    return json({ error: '연결 ID가 필요합니다.' }, 400)
  }
  const rows = await dbRows(
    `integration_connections?id=eq.${encodeURIComponent(body.connectionId)}` +
    `&user_id=eq.${encodeURIComponent(user.id)}&select=*`,
  )
  const connection = rows[0]
  if (!connection) return json({ error: '연결을 찾을 수 없습니다.' }, 404)
  const credentials = await readCredentials(connection.id)
  if (credentials?.access_token) {
    try {
      if (connection.provider === 'google') {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(credentials.access_token)}`,
          { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } },
        )
      } else if (connection.provider === 'todoist') {
        const clientId = Deno.env.get('TODOIST_CLIENT_ID')
        const clientSecret = Deno.env.get('TODOIST_CLIENT_SECRET')
        if (clientId && clientSecret) {
          await fetch('https://api.todoist.com/api/v1/revoke', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              token: credentials.access_token,
              token_type_hint: 'access_token',
            }),
          })
        }
      }
    } catch (error) {
      console.warn('provider token revocation failed', error)
    }
  }
  await dbWrite(
    `integration_connections?id=eq.${encodeURIComponent(connection.id)}` +
    `&user_id=eq.${encodeURIComponent(user.id)}`,
    'DELETE',
  )
  return json({ disconnected: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const path = new URL(req.url).pathname
    if (req.method === 'GET' && path.endsWith('/callback')) return callback(req)
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const body = await req.json().catch(() => ({}))
    if (body.action === 'capabilities') return capabilities()
    const user = await authenticatedUser(req)
    if (!user) return json({ error: '로그인이 필요합니다.' }, 401)
    if (body.action === 'configure') return configureDirect(user, body)
    if (body.action === 'disconnect') return disconnect(user, body)
    return startOAuth(req, user, body)
  } catch (error) {
    console.error('integration-oauth failed', error instanceof Error ? error.message : error)
    return json({ error: '외부 계정 연결을 처리하지 못했습니다.' }, 500)
  }
})
