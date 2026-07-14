export interface Species {
  id: string
  label: string // Korean animal name
  tint: string  // background tint hex
}

// Anthropomorphized hospital-animal roster (memes: 소/곰/알파카/개구리/햄스터/펭귄).
// Real art is swapped in later via mascotAssets; this is the source of truth for ids.
export const SPECIES: Species[] = [
  { id: 'cow', label: '소', tint: '#7c5cff' },
  { id: 'bear', label: '곰', tint: '#a16207' },
  { id: 'alpaca', label: '알파카', tint: '#ec4899' },
  { id: 'frog', label: '개구리', tint: '#22c55e' },
  { id: 'hamster', label: '햄스터', tint: '#f59e0b' },
  { id: 'penguin', label: '펭귄', tint: '#0ea5e9' },
]

export const SPECIES_IDS = SPECIES.map((s) => s.id)

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id)
}
