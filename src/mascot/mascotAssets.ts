import type { Stage } from './stage'
import { animalById } from './roster'

// The ONLY place art is resolved — swapping glyph → <img src> later is a
// one-file change. `stage` is accepted so future art can vary per stage.
export function mascotArt(animalId: string, _stage: Stage): string {
  return animalById(animalId)?.glyph ?? '🐣'
}
