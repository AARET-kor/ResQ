export interface DayCell {
  date: string // YYYY-MM-DD (local)
  inMonth: boolean
}

function iso(y: number, m0: number, d: number): string {
  const dt = new Date(y, m0, d)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

/** 42-cell (6-week) Sunday-first grid for the given month (month0 = 0-11). */
export function monthGrid(year: number, month0: number): DayCell[] {
  const first = new Date(year, month0, 1)
  const startOffset = first.getDay() // 0 = Sunday
  const cells: DayCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month0, 1 - startOffset + i)
    cells.push({
      date: iso(d.getFullYear(), d.getMonth(), d.getDate()),
      inMonth: d.getMonth() === month0,
    })
  }
  return cells
}

/** [start, end) ISO dates covering the month — for range queries. */
export function monthRangeISO(year: number, month0: number): { start: string; end: string } {
  return { start: iso(year, month0, 1), end: iso(year, month0 + 1, 1) }
}
