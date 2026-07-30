import {
  CORS,
  authenticatedUser,
  beginSync,
  dbRows,
  dbWrite,
  finishSync,
  json,
  type JsonRecord,
} from '../_shared/integration.ts'
import { syncCalDav, syncIcs } from './calendarFeeds.ts'
import { syncGoogle } from './google.ts'
import { syncMicrosoft } from './microsoft.ts'
import { syncTodoist } from './todoist.ts'
import type { SyncResult } from './common.ts'

type SyncProvider = 'google' | 'microsoft' | 'todoist' | 'ics' | 'caldav'

async function connectionFor(
  userId: string,
  provider: SyncProvider,
): Promise<JsonRecord | null> {
  const rows = await dbRows(
    `integration_connections?user_id=eq.${encodeURIComponent(userId)}` +
    `&provider=eq.${encodeURIComponent(provider)}` +
    '&status=in.(active,error)&select=*&limit=1',
  )
  return rows[0] ?? null
}

async function synchronize(
  userId: string,
  provider: SyncProvider,
  discoverOnly = false,
): Promise<SyncResult> {
  const connection = await connectionFor(userId, provider)
  if (!connection) throw new Error(`${provider.toUpperCase()}_NOT_CONNECTED`)
  if (!await beginSync(connection.id, userId)) throw new Error('SYNC_ALREADY_RUNNING')
  try {
    const result = provider === 'google'
      ? await syncGoogle(userId, connection, { discoverOnly })
      : provider === 'microsoft'
        ? await syncMicrosoft(userId, connection, { discoverOnly })
        : provider === 'todoist'
          ? await syncTodoist(userId, connection, { discoverOnly })
          : provider === 'ics'
            ? await syncIcs(userId, connection)
            : await syncCalDav(userId, connection)
    if (discoverOnly) {
      await dbWrite(
        `integration_connections?id=eq.${encodeURIComponent(connection.id)}`,
        'PATCH',
        {
          sync_locked_until: null,
          status: 'active',
          last_error: null,
        },
      )
    } else {
      await finishSync(connection.id, userId, null)
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'UNKNOWN'
    await finishSync(connection.id, userId, message).catch(() => {})
    throw error
  }
}

function errorResponse(error: unknown): Response {
  const code = error instanceof Error ? error.message : 'UNKNOWN'
  console.error('integration-sync failed', code)
  if (code === 'SYNC_ALREADY_RUNNING') {
    return json({ error: '이미 동기화가 진행 중입니다. 잠시 후 다시 시도해주세요.' }, 409)
  }
  if (code.endsWith('_NOT_CONNECTED')) {
    return json({ error: '외부 계정이 연결되어 있지 않습니다.' }, 409)
  }
  if (code.endsWith('_RECONNECT_REQUIRED')) {
    return json({ error: '외부 계정 연결이 만료되었습니다. 다시 연결해주세요.' }, 401)
  }
  if (code.endsWith('_OAUTH_NOT_CONFIGURED') || code === 'TOKEN_ENCRYPTION_NOT_CONFIGURED') {
    return json({ error: '외부 연동 서버 설정이 아직 완료되지 않았습니다.' }, 503)
  }
  if (code.startsWith('CALDAV_') || code.startsWith('ICS_')) {
    return json({ error: '구독 서버에 연결하지 못했습니다. 주소와 앱 비밀번호를 확인해주세요.' }, 502)
  }
  return json({ error: '일정과 할 일 동기화에 실패했습니다.' }, 502)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const user = await authenticatedUser(req)
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401)
  try {
    const body = await req.json().catch(() => ({}))
    const provider = body.provider as SyncProvider
    if (body.action !== undefined && !['sync', 'discover'].includes(String(body.action))) {
      return json({ error: '지원하지 않는 동기화 작업입니다.' }, 400)
    }
    if (!['google', 'microsoft', 'todoist', 'ics', 'caldav'].includes(provider)) {
      return json({ error: '지원하지 않는 동기화 제공자입니다.' }, 400)
    }
    const discoverOnly = body.action === 'discover'
    if (discoverOnly && !['google', 'microsoft', 'todoist'].includes(provider)) {
      return json({ error: '이 연결은 별도 목록 탐색을 지원하지 않습니다.' }, 400)
    }
    return json(await synchronize(user.id, provider, discoverOnly))
  } catch (error) {
    return errorResponse(error)
  }
})
