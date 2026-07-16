import { describe, it, expect } from 'vitest'
import { journalsFor, journalById } from './sources'

describe('journal sources', () => {
  it('lists plastic-surgery journals including Thieme OA APS', () => {
    const js = journalsFor('성형외과')
    expect(js.length).toBeGreaterThanOrEqual(5)
    const aps = js.find((j) => j.id === 'aps')!
    expect(aps.oa).toBe(true)
    expect(aps.publisher).toBe('Thieme')
    expect(aps.ta).toBe('Arch Plast Surg')
  })
  it('resolves aliases and unknown specialties', () => {
    expect(journalsFor('마취과')).toEqual([]) // no registry yet → empty
    expect(journalsFor(null)).toEqual([])
  })
  it('looks a journal up by id within a specialty', () => {
    expect(journalById('성형외과', 'prs')?.ta).toBe('Plast Reconstr Surg')
    expect(journalById('성형외과', 'nope')).toBeUndefined()
  })
})
