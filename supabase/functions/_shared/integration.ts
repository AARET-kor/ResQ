export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
}

export type JsonRecord = Record<string, any>

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS })
}

export function serviceHeaders(extra: HeadersInit = {}): Headers {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...Object.fromEntries(new Headers(extra)),
  })
}

export async function database(path: string, init: RequestInit = {}): Promise<Response> {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) throw new Error('SERVER_CONFIG')
  return fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
  })
}

export async function dbRows(path: string): Promise<JsonRecord[]> {
  const response = await database(path)
  if (!response.ok) throw new Error(`DATABASE_${response.status}`)
  const body = await response.json()
  return Array.isArray(body) ? body : []
}

export async function dbWrite(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  prefer = 'return=minimal',
): Promise<JsonRecord[]> {
  const response = await database(path, {
    method,
    headers: { Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const message = await response.text()
    console.error('database write failed', response.status, message.slice(0, 300))
    throw new Error(`DATABASE_${response.status}`)
  }
  if (prefer.includes('return=representation')) {
    const value = await response.json()
    return Array.isArray(value) ? value : []
  }
  return []
}

export async function authenticatedUser(req: Request): Promise<{ id: string } | null> {
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function encryptionKey(): Promise<CryptoKey> {
  const raw = Deno.env.get('INTEGRATION_TOKEN_ENCRYPTION_KEY')
  if (!raw || raw.length < 24) throw new Error('TOKEN_ENCRYPTION_NOT_CONFIGURED')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(value: string | null | undefined): Promise<string | null> {
  if (!value) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  )
  return `enc:v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`
}

export async function decryptSecret(value: string | null | undefined): Promise<string | null> {
  if (!value) return null
  if (!value.startsWith('enc:v1:')) return value
  const [, , iv, ciphertext] = value.split(':')
  if (!iv || !ciphertext) throw new Error('INVALID_ENCRYPTED_SECRET')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(ciphertext),
  )
  return new TextDecoder().decode(decrypted)
}

export interface StoredCredentials extends JsonRecord {
  access_token: string
  refresh_token: string | null
}

export async function readCredentials(connectionId: string): Promise<StoredCredentials | null> {
  const rows = await dbRows(
    `integration_credentials?connection_id=eq.${encodeURIComponent(connectionId)}&select=*`,
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    access_token: await decryptSecret(rows[0].access_token) ?? '',
    refresh_token: await decryptSecret(rows[0].refresh_token),
  } as StoredCredentials
}

export async function storeCredentials(
  connectionId: string,
  credentials: {
    access_token: string
    refresh_token?: string | null
    token_type?: string
    expires_at?: string | null
    scope?: string | null
    endpoint_url?: string | null
    username?: string | null
  },
): Promise<void> {
  await dbWrite(
    'integration_credentials?on_conflict=connection_id',
    'POST',
    {
      connection_id: connectionId,
      access_token: await encryptSecret(credentials.access_token),
      refresh_token: await encryptSecret(credentials.refresh_token),
      token_type: credentials.token_type ?? 'Bearer',
      expires_at: credentials.expires_at ?? null,
      scope: credentials.scope ?? null,
      endpoint_url: credentials.endpoint_url ?? null,
      username: credentials.username ?? null,
      updated_at: new Date().toISOString(),
    },
    'resolution=merge-duplicates,return=minimal',
  )
}

export function validateRemoteHttpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
      host === 'localhost'
      || host.endsWith('.local')
      || host === '0.0.0.0'
      || host === '::1'
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^169\.254\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      || /^fc/i.test(host)
      || /^fd/i.test(host)
      || /^fe[89ab]/i.test(host)
      || host.startsWith('::ffff:')
    ) return null
    return url
  } catch {
    return null
  }
}

export async function beginSync(connectionId: string, userId: string): Promise<boolean> {
  const response = await database('rpc/begin_integration_sync', {
    method: 'POST',
    body: JSON.stringify({
      p_connection_id: connectionId,
      p_user_id: userId,
      p_lock_seconds: 180,
    }),
  })
  if (!response.ok) throw new Error(`DATABASE_${response.status}`)
  return await response.json() === true
}

export async function finishSync(
  connectionId: string,
  userId: string,
  error: string | null,
): Promise<void> {
  const response = await database('rpc/finish_integration_sync', {
    method: 'POST',
    body: JSON.stringify({
      p_connection_id: connectionId,
      p_user_id: userId,
      p_error: error,
    }),
  })
  if (!response.ok) throw new Error(`DATABASE_${response.status}`)
}
