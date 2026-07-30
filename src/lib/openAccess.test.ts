import { describe, it, expect, vi } from 'vitest'
import { findOaCopy, scholarSearchUrl } from './openAccess'

describe('findOaCopy', () => {
  it('returns the best legal OA location for a DOI', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        is_oa: true,
        best_oa_location: { url_for_pdf: 'https://repo.org/x.pdf', url: 'https://repo.org/x', version: 'publishedVersion', license: 'cc-by' },
      }),
    })
    const copy = await findOaCopy('10.1097/PRS.0000000000001', fetcher as any)
    expect(copy).toEqual({ url: 'https://repo.org/x.pdf', version: 'publishedVersion', license: 'cc-by' })
    const url = fetcher.mock.calls[0][0] as string
    expect(url).toContain('api.unpaywall.org/v2/')
    expect(url).toContain('email=')
  })
  it('strips doi.org prefixes before querying', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ is_oa: false }) })
    await findOaCopy('https://doi.org/10.1/abc', fetcher as any)
    expect(fetcher.mock.calls[0][0]).toContain(encodeURIComponent('10.1/abc'))
  })
  it('returns null when no OA copy exists or the DOI is unknown', async () => {
    const none = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ is_oa: false, best_oa_location: null }) })
    expect(await findOaCopy('10.1/none', none as any)).toBeNull()
    const missing = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    expect(await findOaCopy('10.1/missing', missing as any)).toBeNull()
    expect(await findOaCopy('', vi.fn() as any)).toBeNull()
  })
  it('throws on server errors so the UI can show a retry message', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    await expect(findOaCopy('10.1/err', bad as any)).rejects.toThrow(/unpaywall/)
  })
})

describe('scholarSearchUrl', () => {
  it('builds an encoded Scholar deep link', () => {
    const url = scholarSearchUrl('DIEP flap outcomes & risks')
    expect(url).toContain('scholar.google.com/scholar?q=')
    expect(url).toContain(encodeURIComponent('DIEP flap outcomes & risks'))
  })
})
