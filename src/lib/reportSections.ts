export interface ReportSection {
  title: string
  body: string
}

/**
 * Split a breakdown report into navigable sections on `## ` markdown headings
 * (Caramel-style numbered tab nav). Reports without headings — e.g. the
 * abstract-mode ①…⑤ format — fall back to a single section so nothing breaks.
 */
export function splitReportSections(text: string): ReportSection[] {
  const parts = text.split(/^##\s+/m).map((s) => s.trim()).filter(Boolean)
  // parts[0] is preamble when the text doesn't start with a heading.
  const startsWithHeading = /^##\s+/m.test(text.trimStart().slice(0, 4)) || text.trimStart().startsWith('## ')
  const sections: ReportSection[] = []
  parts.forEach((part, i) => {
    if (i === 0 && !startsWithHeading) {
      if (part) sections.push({ title: '개요', body: part })
      return
    }
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = (nl === -1 ? '' : part.slice(nl + 1)).trim()
    sections.push({ title, body })
  })
  if (sections.length <= 1) return [{ title: '리포트', body: text.trim() }]
  return sections
}
