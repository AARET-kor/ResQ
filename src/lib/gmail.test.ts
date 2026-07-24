import { describe, it, expect, vi } from 'vitest'
import { listRecentEmailTexts, requestEventExtraction } from './gmail'

describe('listRecentEmailTexts', () => {
  it('lists candidate messages and decodes their bodies', async () => {
    const bodyB64 = btoa(unescape(encodeURIComponent('학회 안내: 8월 20일 코엑스'))).replace(/\+/g, '-').replace(/\//g, '_')
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [{ id: 'm1' }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
        payload: {
          headers: [{ name: 'Subject', value: '추계학술대회 안내' }],
          parts: [{ mimeType: 'text/plain', body: { data: bodyB64 } }],
        },
        snippet: 'snippet',
      }) })
    const emails = await listRecentEmailTexts('tok', fetcher as any)
    expect(emails).toHaveLength(1)
    expect(emails[0].subject).toBe('추계학술대회 안내')
    expect(emails[0].body).toContain('코엑스')
    expect(fetcher.mock.calls[0][0]).toContain('gmail/v1/users/me/messages')
    expect(fetcher.mock.calls[0][0]).toContain('newer_than')
  })
  it('returns [] when there are no matches', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
    expect(await listRecentEmailTexts('tok', fetcher as any)).toEqual([])
  })
  it('redacts patient identifiers before returning email text', async () => {
    const bodyB64 = btoa(unescape(encodeURIComponent('환자명: 김철수 등록번호 MRN-12345 010-1234-5678')))
      .replace(/\+/g, '-').replace(/\//g, '_')
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [{ id: 'm1' }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
        payload: {
          headers: [{ name: 'Subject', value: '환자명: 이영희 일정' }],
          parts: [{ mimeType: 'text/plain', body: { data: bodyB64 } }],
        },
      }) })
    const [email] = await listRecentEmailTexts('tok', fetcher as any)
    expect(email.subject).not.toContain('이영희')
    expect(email.body).not.toContain('김철수')
    expect(email.body).not.toContain('MRN-12345')
    expect(email.body).not.toContain('010-1234-5678')
  })
  it('throws on 401', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(listRecentEmailTexts('tok', fetcher as any)).rejects.toThrow()
  })
})

describe('requestEventExtraction', () => {
  it('invokes the edge function and returns candidates', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { events: [{ title: '추계학술대회', starts_at: '2026-08-20T09:00:00+09:00', kind: 'conference' }] }, error: null })
    const client = { functions: { invoke } } as any
    const out = await requestEventExtraction(client, [{ subject: 's', body: 'b' }], '성형외과')
    expect(out).toHaveLength(1)
    expect(invoke.mock.calls[0][0]).toBe('extract-events')
  })
  it('throws a friendly error when the function is unreachable', async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } }) } } as any
    await expect(requestEventExtraction(client, [], null)).rejects.toThrow(/추출 서버/)
  })
  it('surfaces a structured Edge Function error to the user', async () => {
    const context = Response.json(
      { error: 'Gmail AI 처리에 대한 명시적 동의가 필요합니다.' },
      { status: 403 },
    )
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: { context } }),
      },
    } as any
    await expect(requestEventExtraction(client, [], null)).rejects.toThrow(/명시적 동의/)
  })
  it('drops malformed LLM candidates (missing/invalid fields) instead of crashing later', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        events: [
          { title: '정상 일정', starts_at: '2026-08-20T09:00:00+09:00', kind: 'conference' },
          { title: '날짜 없음', kind: 'conference' },                         // no starts_at
          { title: '깨진 날짜', starts_at: 'not-a-date', kind: 'other' },      // invalid date
          { title: '이상한 종류', starts_at: '2026-08-21T09:00:00+09:00', kind: 'party' }, // bad kind
          { starts_at: '2026-08-22T09:00:00+09:00', kind: 'other' },           // no title
          'garbage',                                                            // not an object
        ],
      },
      error: null,
    })
    const client = { functions: { invoke } } as any
    const out = await requestEventExtraction(client, [{ subject: 's', body: 'b' }], null)
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('정상 일정')
  })
})
