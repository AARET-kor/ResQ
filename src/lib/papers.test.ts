import { describe, it, expect } from 'vitest'
import { getAnalysis, saveAnalysis, requestAnalysis, requestPaperIdeation, requestReport, listMyReports, type PaperAnalysis } from './papers'
import type { Paper } from './pubmed'

const paper: Paper = {
  pmid: '111', title: 'T', journal: 'J', year: '2026', abstract: 'A', url: 'https://pubmed.ncbi.nlm.nih.gov/111/', pmcid: null,
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

function fakeClientList(rows: any[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  } as any
}

describe('papers v2', () => {
  it('requestPaperIdeation sends a bounded ideation request', async () => {
    const c = fakeClient(null, { data: { analysis: '## 가설' }, error: null })
    const text = await requestPaperIdeation(c, paper, '성형외과')
    expect(text).toBe('## 가설')
    expect(c.calls[0].args).toMatchObject({
      mode: 'ideation',
      title: 'T',
      abstract: 'A',
      specialty: '성형외과',
    })
  })

  it('requestReport sends report mode with fulltext', async () => {
    const c = fakeClient(null, { data: { analysis: '## 요약' }, error: null })
    const text = await requestReport(c, paper, '성형외과', { fulltext: 'BODY TEXT' })
    expect(text).toBe('## 요약')
    expect(c.calls[0].args.mode).toBe('report')
    expect(c.calls[0].args.fulltext).toBe('BODY TEXT')
  })
  it('requestReport sends pdf payloads', async () => {
    const c = fakeClient(null)
    await requestReport(c, paper, '성형외과', {
      pdfBase64: 'QUJD',
      pdfMediaType: 'application/pdf',
    })
    expect(c.calls[0].args.pdfBase64).toBe('QUJD')
    expect(c.calls[0].args.pdfMediaType).toBe('application/pdf')
  })
  it('surfaces a structured edge-function error', async () => {
    const context = Response.json({ error: 'PDF는 50MB 이하만 업로드할 수 있습니다.' }, { status: 413 })
    const c = fakeClient(null, { data: null, error: { context } })
    await expect(requestReport(c, paper, '성형외과', {
      pdfBase64: 'QUJD',
      pdfMediaType: 'application/pdf',
    })).rejects.toThrow(/50MB/)
  })
  it('saveAnalysis persists kind, fulltext flag and source', async () => {
    const c = fakeClient(null)
    const row = await saveAnalysis(c, 'u1', paper, '리포트', { kind: 'report', hasFulltext: true, source: 'Arch Plast Surg' })
    expect(c.calls[0].args.kind).toBe('report')
    expect(c.calls[0].args.has_fulltext).toBe(true)
    expect(c.calls[0].args.source).toBe('Arch Plast Surg')
    expect(row.analysis).toBe('리포트')
  })
  it('listMyReports queries the user library', async () => {
    const rows = [{ id: 'pa1', pmid: '111', title: 'T', analysis: 'A', kind: 'report' }]
    const c = fakeClientList(rows as any)
    expect(await listMyReports(c, 'u1')).toHaveLength(1)
  })
})
