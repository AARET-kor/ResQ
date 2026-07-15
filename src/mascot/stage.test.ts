import { describe, it, expect } from 'vitest'
import { stageFromProgress } from './stage'

describe('stageFromProgress', () => {
  it('maps training-progress percent to a career stage', () => {
    expect(stageFromProgress(0)).toBe('INTERN')
    expect(stageFromProgress(24.9)).toBe('INTERN')
    expect(stageFromProgress(25)).toBe('JUNIOR')
    expect(stageFromProgress(49)).toBe('JUNIOR')
    expect(stageFromProgress(50)).toBe('SENIOR')
    expect(stageFromProgress(74)).toBe('SENIOR')
    expect(stageFromProgress(75)).toBe('CHIEF')
    expect(stageFromProgress(100)).toBe('CHIEF')
  })
})
