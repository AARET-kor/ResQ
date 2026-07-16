import { canonicalSpecialty } from '../mascot/roster'

export interface JournalSource {
  id: string
  label: string
  ta: string        // PubMed journal title abbreviation ([ta] filter)
  oa: boolean       // open access → PMC full text expected
  publisher: string
}

/**
 * 전공별 학회지/저널 레지스트리 (config). 성형외과 파일럿.
 * 유료지는 PubMed 메타데이터+초록까지만 — 본문 스크래핑은 하지 않는다.
 * Thieme 커버: Archives of Plastic Surgery(대한성형외과학회지, OA), J Reconstr Microsurg.
 */
export const SPECIALTY_JOURNALS: Record<string, JournalSource[]> = {
  성형외과: [
    { id: 'prs', label: 'Plast Reconstr Surg (PRS)', ta: 'Plast Reconstr Surg', oa: false, publisher: 'LWW' },
    { id: 'aps', label: 'Archives of Plastic Surgery (대한성형외과학회지)', ta: 'Arch Plast Surg', oa: true, publisher: 'Thieme' },
    { id: 'jpras', label: 'JPRAS', ta: 'J Plast Reconstr Aesthet Surg', oa: false, publisher: 'Elsevier' },
    { id: 'apls', label: 'Aesthetic Plastic Surgery', ta: 'Aesthetic Plast Surg', oa: false, publisher: 'Springer' },
    { id: 'asj', label: 'Aesthetic Surgery Journal', ta: 'Aesthet Surg J', oa: false, publisher: 'OUP' },
    { id: 'acfs', label: 'Arch Craniofac Surg', ta: 'Arch Craniofac Surg', oa: true, publisher: '대한두개안면성형외과학회' },
    { id: 'jrm', label: 'J Reconstr Microsurg', ta: 'J Reconstr Microsurg', oa: false, publisher: 'Thieme' },
  ],
}

export function journalsFor(specialty: string | null | undefined): JournalSource[] {
  return SPECIALTY_JOURNALS[canonicalSpecialty(specialty)] ?? []
}

export function journalById(specialty: string | null | undefined, id: string): JournalSource | undefined {
  return journalsFor(specialty).find((j) => j.id === id)
}
