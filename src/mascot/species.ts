import { SPECIES_IDS } from './roster'

/** Deterministic given `rand` in [0,1) — inject Math.random() at the call site for real use. */
export function pickSpecies(rand: number): string {
  const i = Math.min(SPECIES_IDS.length - 1, Math.floor(rand * SPECIES_IDS.length))
  return SPECIES_IDS[i]
}
