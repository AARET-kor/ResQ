import { describe, it, expect, vi } from 'vitest'
import { getAnalysis, saveAnalysis, requestAnalysis, type PaperAnalysis } from './papers'
import type { Paper } from './pubmed'

const paper: Paper = {
  pmid: '111', title: 'T', journal: 'J', year: '2026', abstract: 'A', url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
}

function fakeClient(row: PaperAnalysis | null, invokeResult: any = { data: { analysis: '분석' }, error: null }) {
  const calls: { op: string; args: any }[] = []
  return {
    calls,
    functions: { invoke: (name: string, opts: any) => { calls.push({ op: `invoke:${name}`, args: opts.body }); return Promise.resolve(invokeResult) } },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
      }),
      upsert: (values: any) => ({
        select: () => ({
          single: () => { calls.push({ op: 'upsert', args: values }); return Promise.resolve({ data: { id: 'pa1', ...values }, error: null }) },
        }),
      }),
    }),
  } as any
}

describe('papers data access', () => {
  it('getAnalysis returns null when uncached', async () => {
    expect(await getAnalysis(fakeClient(null), 'u1', '111')).toBeNull()
  })
  it('requestAnalysis invokes the edge function and returns the text', async () => {
    const c = fakeClient(null)
    const text = await requestAnalysis(c, paper, '내과')
    expect(text).toBe('분석')
    expect(c.calls[0].op).toBe('invoke:analyze-paper')
  })
  it('requestAnalysis throws a friendly error when the function is unreachable', async () => {
    const c = fakeClient(null, { data: null, error: { message: 'Failed to send a request' } })
    await expect(requestAnalysis(c, paper, '내과')).rejects.toThrow(/분석 서버/)
  })
  it('saveAnalysis upserts the row with user and pmid', async () => {
    const c = fakeClient(null)
    const row = await saveAnalysis(c, 'u1', paper, '분석 결과')
    expect(row.analysis).toBe('분석 결과')
    expect(c.calls[0].args.user_id).toBe('u1')
    expect(c.calls[0].args.pmid).toBe('111')
  })
})
