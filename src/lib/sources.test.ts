import { describe, it, expect } from 'vitest'
import { journalsFor, journalById, jifForJournal } from './sources'

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
  it('lists dermatology journals including OA Ann Dermatol', () => {
    const js = journalsFor('피부과')
    expect(js.length).toBeGreaterThanOrEqual(5)
    const annd = js.find((j) => j.id === 'annd')!
    expect(annd.oa).toBe(true)
  })
  it('looks up config JIF by journal title', () => {
    expect(jifForJournal('Plast Reconstr Surg')).toBe(3.9)
    expect(jifForJournal('Unknown Journal')).toBeUndefined()
  })
  it('includes unindexed 성형외과 society journals with homepage links', () => {
    const js = journalsFor('성형외과')
    const aaps = js.find((j) => j.id === 'aaps')!
    expect(aaps.indexed).toBe(false)
    expect(aaps.kr).toBe(true)
    const kr = journalsFor('성형외과').filter((j) => j.kr && j.indexed !== false)
    expect(kr.map((j) => j.id)).toEqual(expect.arrayContaining(['aps', 'acfs']))
    expect(aaps.homepage).toBeTruthy()
  })
})
