import type { Stage } from './stage'

// Placeholder glyphs until real premium line-art is produced. Keep this the ONLY
// place art is resolved so swapping emoji → <img src> later is a one-file change.
const GLYPH: Record<string, string> = {
  cow: '🐮',
  bear: '🐻',
  alpaca: '🦙',
  frog: '🐸',
  hamster: '🐹',
  penguin: '🐧',
}

// `stage` is accepted now so the future art registry can vary art per stage
// without changing callers. The placeholder ignores it intentionally.
export function mascotArt(speciesId: string, _stage: Stage): string {
  return GLYPH[speciesId] ?? '🐣'
}
