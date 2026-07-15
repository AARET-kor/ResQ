export type DayPhase = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT'

/** Hour (0-23) in Asia/Seoul, independent of the machine timezone. */
export function hourInKST(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  )
}

/** Sky scene by KST: 새벽 05–08 / 낮 08–17 / 노을 17–20 / 밤 20–05. */
export function timeOfDayKST(now: Date = new Date()): DayPhase {
  const h = hourInKST(now)
  if (h >= 5 && h < 8) return 'DAWN'
  if (h >= 8 && h < 17) return 'DAY'
  if (h >= 17 && h < 20) return 'DUSK'
  return 'NIGHT'
}

/** CSS background per phase. Deep-navy base keeps the ResQ identity at night. */
export const SKY: Record<DayPhase, string> = {
  DAWN: 'linear-gradient(180deg, #1a2151 0%, #5b4a8a 55%, #d98a6a 100%)',
  DAY: 'linear-gradient(180deg, #2a4d8f 0%, #4a7bc4 60%, #8fb8e8 100%)',
  DUSK: 'linear-gradient(180deg, #101643 0%, #6a3d7a 55%, #e8734a 100%)',
  NIGHT: 'linear-gradient(180deg, #010828 0%, #0a1240 60%, #1a2151 100%)',
}
