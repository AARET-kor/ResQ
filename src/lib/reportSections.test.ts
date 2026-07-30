import { describe, it, expect } from 'vitest'
import { splitReportSections } from './reportSections'

describe('splitReportSections', () => {
  it('splits ## headings into titled sections', () => {
    const text = '## 요약 (3줄)\n첫째. 둘째. 셋째.\n\n## 연구 배경\n배경 설명.\n\n## 한계\n한계 설명.'
    const s = splitReportSections(text)
    expect(s.map((x) => x.title)).toEqual(['요약 (3줄)', '연구 배경', '한계'])
    expect(s[1].body).toBe('배경 설명.')
  })
  it('keeps preamble before the first heading as 개요', () => {
    const text = '서지: NEJM 2026\n\n## 방법\n방법 내용'
    const s = splitReportSections(text)
    expect(s[0].title).toBe('개요')
    expect(s[0].body).toContain('서지')
    expect(s[1].title).toBe('방법')
  })
  it('falls back to a single section for the abstract-mode format', () => {
    const text = '① 세 줄 요약 …\n② 연구 방법 …'
    const s = splitReportSections(text)
    expect(s).toHaveLength(1)
    expect(s[0].title).toBe('리포트')
    expect(s[0].body).toContain('① 세 줄 요약')
  })
})
