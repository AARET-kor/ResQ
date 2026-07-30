import type { Stage } from './stage'

export interface StageArt {
  src: string
  bg: string    // full-bleed hero background while this stage is centered
  panel: string // lighter companion tone (accents)
}

// Per-stage figurine art (user-supplied set). One shared figurine per stage for
// every species until per-animal art is produced — this file remains the ONLY
// art-resolution seam, so that swap stays a one-file change.
export const STAGE_ART: Record<Stage, StageArt> = {
  INTERN: {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png',
    bg: '#F4845F',
    panel: '#F79B7F',
  },
  JUNIOR: {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/2.b977faab.png',
    bg: '#6BBF7A',
    panel: '#85CC92',
  },
  SENIOR: {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/3.4df853b4.png',
    bg: '#E882B4',
    panel: '#ED9DC4',
  },
  CHIEF: {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/4.4457fbce.png',
    bg: '#6EB5FF',
    panel: '#8DC4FF',
  },
}

/** Art for a species at a stage. Species-specific art lands here later. */
export function mascotArt(_speciesId: string, stage: Stage): string {
  return (STAGE_ART[stage] ?? STAGE_ART.INTERN).src
}
