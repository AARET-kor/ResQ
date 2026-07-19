import { describe, it, expect, vi } from 'vitest'
import { requestTodoExtraction } from './todoExtract'

function client(result: any) {
  return { functions: { invoke: vi.fn().mockResolvedValue(result) } } as any
}

describe('requestTodoExtraction', () => {
  it('passes text/image input through and returns valid todos', async () => {
    const c = client({ data: { todos: [{ title: '초록 제출', due_date: '2026-07-25', due_time: '17:00', priority: 'high' }] }, error: null })
    const out = await requestTodoExtraction(c, { text: '메모' }, '성형외과')
    expect(out).toEqual([{ title: '초록 제출', due_date: '2026-07-25', due_time: '17:00', priority: 'high' }])
    expect(c.functions.invoke.mock.calls[0][0]).toBe('extract-todos')
    expect(c.functions.invoke.mock.calls[0][1].body.text).toBe('메모')
  })
  it('drops malformed items and normalizes bad priorities', async () => {
    const c = client({ data: { todos: [
      { title: 'ok', priority: 'urgent!!' },          // bad priority → normal
      { title: '', priority: 'high' },                 // no title → dropped
      { title: 'bad date', due_date: 'not-a-date' },   // dropped
      { title: 'bad time', due_time: '25시' },         // dropped
      'garbage',
    ] }, error: null })
    const out = await requestTodoExtraction(c, { text: 'x' }, null)
    expect(out).toEqual([{ title: 'ok', due_date: null, due_time: null, priority: 'normal' }])
  })
  it('throws a friendly error when unreachable', async () => {
    const c = client({ data: null, error: { message: 'x' } })
    await expect(requestTodoExtraction(c, { text: 'x' }, null)).rejects.toThrow(/추출 서버/)
  })
})
