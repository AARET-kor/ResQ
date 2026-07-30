import { describe, it, expect } from 'vitest'
import { calendarGridRangeISO, monthGrid, monthRangeISO } from './calendar'

describe('monthGrid', () => {
  it('returns 42 cells starting on Sunday', () => {
    const cells = monthGrid(2026, 6) // July 2026 (month0)
    expect(cells).toHaveLength(42)
    // 2026-07-01 is a Wednesday → grid starts Sun 2026-06-28
    expect(cells[0].date).toBe('2026-06-28')
    expect(cells[3].date).toBe('2026-07-01')
    expect(cells[3].inMonth).toBe(true)
    expect(cells[0].inMonth).toBe(false)
  })
  it('marks all in-month days and only them', () => {
    const cells = monthGrid(2026, 1) // Feb 2026 (28 days)
    expect(cells.filter((c) => c.inMonth)).toHaveLength(28)
  })
  it('handles a month starting on Sunday', () => {
    const cells = monthGrid(2026, 2) // March 2026 starts Sunday
    expect(cells[0].date).toBe('2026-03-01')
    expect(cells[0].inMonth).toBe(true)
  })
})

describe('monthRangeISO', () => {
  it('returns inclusive start / exclusive end instants of the month', () => {
    const { start, end } = monthRangeISO(2026, 6)
    expect(start).toBe('2026-07-01')
    expect(end).toBe('2026-08-01')
  })
  it('wraps the year in December', () => {
    const { end } = monthRangeISO(2026, 11)
    expect(end).toBe('2027-01-01')
  })
})

describe('calendarGridRangeISO', () => {
  it('covers every visible day in the 42-cell grid', () => {
    const { start, end } = calendarGridRangeISO(2026, 6)
    expect(start).toBe('2026-06-28')
    expect(end).toBe('2026-08-09')
  })

  it('wraps year boundaries for leading and trailing grid days', () => {
    expect(calendarGridRangeISO(2026, 0)).toEqual({
      start: '2025-12-28',
      end: '2026-02-08',
    })
    expect(calendarGridRangeISO(2026, 11)).toEqual({
      start: '2026-11-29',
      end: '2027-01-10',
    })
  })
})
