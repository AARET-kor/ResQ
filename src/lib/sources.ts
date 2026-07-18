import { canonicalSpecialty } from '../mascot/roster'

export interface JournalSource {
  id: string
  label: string
  ta: string        // PubMed journal title abbreviation ([ta] filter)
  oa: boolean       // open access → PMC full text expected
  publisher: string
  /** 참고용 config JIF (2023 JCR 근사치). 공식 실시간 IF는 유료 라이선스라 config로만 유지한다. */
  jif?: number
  homepage?: string
  /** false → 국제 DB(PubMed 등) 미색인 학회지. 검색 필터로 쓰지 않고 UI에서 바로가기 링크 칩으로만 노출한다. */
  indexed?: boolean
}

/**
 * 전공별 학회지/저널 레지스트리 (config). 성형외과 파일럿.
 * 유료지는 PubMed 메타데이터+초록까지만 — 본문 스크래핑은 하지 않는다.
 * Thieme 커버: Archives of Plastic Surgery(대한성형외과학회지, OA), J Reconstr Microsurg.
 */
export const SPECIALTY_JOURNALS: Record<string, JournalSource[]> = {
  성형외과: [
    { id: 'prs', label: 'Plast Reconstr Surg (PRS)', ta: 'Plast Reconstr Surg', oa: false, publisher: 'LWW', jif: 3.9 },
    { id: 'aps', label: 'Archives of Plastic Surgery (대한성형외과학회지)', ta: 'Arch Plast Surg', oa: true, publisher: 'Thieme', jif: 1.4, homepage: 'https://www.e-aps.org' },
    { id: 'jpras', label: 'JPRAS', ta: 'J Plast Reconstr Aesthet Surg', oa: false, publisher: 'Elsevier', jif: 2.2 },
    { id: 'apls', label: 'Aesthetic Plastic Surgery', ta: 'Aesthetic Plast Surg', oa: false, publisher: 'Springer', jif: 2.0 },
    { id: 'asj', label: 'Aesthetic Surgery Journal', ta: 'Aesthet Surg J', oa: false, publisher: 'OUP', jif: 3.0 },
    { id: 'acfs', label: 'Arch Craniofac Surg', ta: 'Arch Craniofac Surg', oa: true, publisher: '대한두개안면성형외과학회', homepage: 'https://www.e-acfs.org' },
    { id: 'jrm', label: 'J Reconstr Microsurg', ta: 'J Reconstr Microsurg', oa: false, publisher: 'Thieme', jif: 2.2 },
    { id: 'aaps', label: 'Arch Aesthetic Plast Surg (대한미용성형외과학회지)', ta: 'Arch Aesthet Plast Surg', oa: true, publisher: 'KSAPS', homepage: 'https://www.e-aaps.org', indexed: false },
    { id: 'jwmr', label: 'J Wound Manag Res (대한창상학회지)', ta: 'J Wound Manag Res', oa: true, publisher: 'KWMS', homepage: 'https://www.jwmr.org', indexed: false },
  ],
  피부과: [
    { id: 'jaad', label: 'J Am Acad Dermatol (JAAD)', ta: 'J Am Acad Dermatol', oa: false, publisher: 'Elsevier', jif: 12.8 },
    { id: 'bjd', label: 'Br J Dermatol', ta: 'Br J Dermatol', oa: false, publisher: 'OUP', jif: 11.1 },
    { id: 'jamad', label: 'JAMA Dermatology', ta: 'JAMA Dermatol', oa: false, publisher: 'AMA', jif: 11.5 },
    { id: 'jeadv', label: 'JEADV', ta: 'J Eur Acad Dermatol Venereol', oa: false, publisher: 'Wiley', jif: 8.9 },
    { id: 'jid', label: 'J Invest Dermatol', ta: 'J Invest Dermatol', oa: false, publisher: 'Elsevier', jif: 5.7 },
    { id: 'annd', label: 'Ann Dermatol (대한피부과학회)', ta: 'Ann Dermatol', oa: true, publisher: 'KDA', jif: 1.1 },
  ],
}

export function journalsFor(specialty: string | null | undefined): JournalSource[] {
  return SPECIALTY_JOURNALS[canonicalSpecialty(specialty)] ?? []
}

export function journalById(specialty: string | null | undefined, id: string): JournalSource | undefined {
  return journalsFor(specialty).find((j) => j.id === id)
}

/** Config JIF for a journal title (참고용); undefined when unknown. */
export function jifForJournal(journalTitle: string | null | undefined): number | undefined {
  if (!journalTitle) return undefined
  const t = journalTitle.toLowerCase()
  for (const list of Object.values(SPECIALTY_JOURNALS)) {
    const hit = list.find((j) => j.ta.toLowerCase() === t || j.label.toLowerCase().includes(t) || t.includes(j.ta.toLowerCase()))
    if (hit?.jif != null) return hit.jif
  }
  return undefined
}
