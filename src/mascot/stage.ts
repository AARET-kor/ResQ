export type Stage = 'INTERN' | 'JUNIOR' | 'SENIOR' | 'CHIEF'

/** Evolution stage from residency training progress (percent 0..100). */
export function stageFromProgress(percent: number): Stage {
  if (percent < 25) return 'INTERN'
  if (percent < 50) return 'JUNIOR'
  if (percent < 75) return 'SENIOR'
  return 'CHIEF'
}
