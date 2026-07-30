export interface Animal {
  id: string
  label: string // Korean animal name
  glyph: string // placeholder art until real line-art lands
  tint: string  // sky/panel blend color
}

// 십이지 + α. Hospital-friendly anthropomorphized animals; art swapped later.
export const ANIMALS: Animal[] = [
  { id: 'dog', label: '강아지', glyph: '🐶', tint: '#f59e0b' },
  { id: 'cow', label: '소', glyph: '🐮', tint: '#7c5cff' },
  { id: 'horse', label: '말', glyph: '🐴', tint: '#a16207' },
  { id: 'chameleon', label: '카멜레온', glyph: '🦎', tint: '#22c55e' },
  { id: 'rabbit', label: '토끼', glyph: '🐰', tint: '#ec4899' },
  { id: 'rooster', label: '닭', glyph: '🐔', tint: '#ef4444' },
  { id: 'cat', label: '고양이', glyph: '🐱', tint: '#8b5cf6' },
  { id: 'monkey', label: '원숭이', glyph: '🐵', tint: '#d97706' },
  { id: 'tiger', label: '호랑이', glyph: '🐯', tint: '#f97316' },
  { id: 'dragon', label: '용', glyph: '🐲', tint: '#0ea5e9' },
  { id: 'snake', label: '뱀', glyph: '🐍', tint: '#10b981' },
  { id: 'mouse', label: '쥐', glyph: '🐭', tint: '#94a3b8' },
  { id: 'sheep', label: '양', glyph: '🐑', tint: '#cbd5e1' },
  { id: 'pig', label: '돼지', glyph: '🐷', tint: '#f472b6' },
  { id: 'bear', label: '곰', glyph: '🐻', tint: '#92400e' },
  { id: 'peacock', label: '공작', glyph: '🦚', tint: '#22d3ee' },
  { id: 'alpaca', label: '알파카', glyph: '🦙', tint: '#eab308' },
]

export function animalById(id: string): Animal | undefined {
  return ANIMALS.find((a) => a.id === id)
}

export const DEFAULT_ANIMAL_ID = 'alpaca'

/** 전공 → 대표 동물. Config — edit freely; unmapped falls back to alpaca. */
export const SPECIALTY_ANIMALS: Record<string, string> = {
  내과: 'dog',
  정형외과: 'cow',
  외과: 'horse',
  성형외과: 'peacock',
  마취통증의학과: 'chameleon',
  소아청소년과: 'rabbit',
  산부인과: 'rooster',
  정신건강의학과: 'cat',
  영상의학과: 'monkey',
  응급의학과: 'tiger',
  신경과: 'dragon',
  신경외과: 'dragon',
  피부과: 'snake',
  이비인후과: 'mouse',
  안과: 'sheep',
  비뇨의학과: 'pig',
  가정의학과: 'bear',
}

/** Onboarding select options (mapped specialties, in declaration order). */
export const SPECIALTIES = Object.keys(SPECIALTY_ANIMALS)

/** English short codes shown on specialty chips (성형외과 PS, 피부과 DM …). */
export const SPECIALTY_ABBR: Record<string, string> = {
  내과: 'IM',
  정형외과: 'OS',
  외과: 'GS',
  성형외과: 'PS',
  마취통증의학과: 'AN',
  소아청소년과: 'PED',
  산부인과: 'OBGY',
  정신건강의학과: 'PSY',
  영상의학과: 'RAD',
  응급의학과: 'EM',
  신경과: 'NR',
  신경외과: 'NS',
  피부과: 'DM',
  이비인후과: 'ENT',
  안과: 'OPH',
  비뇨의학과: 'URO',
  가정의학과: 'FM',
}

/** Common short/legacy names → official specialty (covers free-text profiles). */
const SPECIALTY_ALIASES: Record<string, string> = {
  마취과: '마취통증의학과',
  정신과: '정신건강의학과',
  소아과: '소아청소년과',
  비뇨기과: '비뇨의학과',
  응급실: '응급의학과',
}

/** Resolve aliases/legacy free-text to the official specialty name. */
export function canonicalSpecialty(specialty: string | null | undefined): string {
  if (!specialty) return ''
  const s = specialty.trim()
  return SPECIALTY_ALIASES[s] ?? s
}

export function animalForSpecialty(specialty: string | null | undefined): Animal {
  const id = SPECIALTY_ANIMALS[canonicalSpecialty(specialty)] ?? DEFAULT_ANIMAL_ID
  return animalById(id)!
}

export interface Variant {
  id: string
  label: string  // hatch personality
  accent: string // accent color in the stat bar
}

export const VARIANTS: Variant[] = [
  { id: 'brave', label: '씩씩이', accent: '#ff6b6b' },
  { id: 'gentle', label: '순둥이', accent: '#ffd166' },
  { id: 'clever', label: '똘똘이', accent: '#4ecdc4' },
  { id: 'quirky', label: '엉뚱이', accent: '#c792ea' },
]

/** Stable "random" hatch: hash the user id — no DB round-trip, fixed per user. */
export function variantForUser(userId: string): Variant {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return VARIANTS[h % VARIANTS.length]
}
