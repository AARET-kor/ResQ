import { describe, expect, it, vi } from 'vitest'
import { requestErrorMessage } from './requestError'

describe('requestErrorMessage', () => {
  it('distinguishes offline failures', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    expect(requestErrorMessage(new Error('x'), '저장 실패')).toMatch(/오프라인/)
  })

  it('distinguishes network failures', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true)
    expect(requestErrorMessage(new TypeError('Failed to fetch'), '저장 실패')).toMatch(/네트워크/)
  })

  it('uses the operation fallback for server errors', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true)
    expect(requestErrorMessage(new Error('permission denied'), '저장 실패')).toBe('저장 실패')
  })
})
