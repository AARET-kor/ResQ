import { describe, expect, it, vi } from 'vitest'
import {
  defaultGoogleSyncWindow,
  discoverGoogleSources,
  GOOGLE_AUTH_ERROR,
} from './googleSync'

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('Google integration discovery', () => {
  it('discovers calendars and task lists with write/default metadata', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/calendar/v3/')) {
        return response({
          items: [
            {
              id: 'primary@example.com',
              summary: '내 캘린더',
              primary: true,
              accessRole: 'owner',
              backgroundColor: '#00ff00',
            },
            {
              id: 'holidays',
              summary: '공휴일',
              accessRole: 'reader',
            },
          ],
        })
      }
      return response({ items: [{ id: 'tasks-1', title: '내 할 일' }] })
    }) as unknown as typeof fetch

    const sources = await discoverGoogleSources('token', fetcher)
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        external_id: 'primary@example.com',
        resource_type: 'calendar',
        is_default: true,
        can_write: true,
      }),
      expect.objectContaining({
        external_id: 'holidays',
        can_write: false,
      }),
      expect.objectContaining({
        external_id: 'tasks-1',
        resource_type: 'task_list',
      }),
    ]))
  })

  it('turns expired provider tokens into a reconnectable error', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      error: { message: 'Invalid Credentials' },
    }, 401)) as unknown as typeof fetch
    await expect(discoverGoogleSources('expired', fetcher)).rejects.toThrow(GOOGLE_AUTH_ERROR)
  })
})

describe('defaultGoogleSyncWindow', () => {
  it('covers 90 days of history and one year ahead', () => {
    const range = defaultGoogleSyncWindow(new Date('2026-07-24T00:00:00.000Z'))
    expect(range.timeMin).toBe('2026-04-25T00:00:00.000Z')
    expect(range.timeMax).toBe('2027-07-24T00:00:00.000Z')
  })
})
