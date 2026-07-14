import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { LiquidGlass } from './LiquidGlass'
import { mascotArt } from '../mascot/mascotAssets'
import type { MascotState } from '../mascot/state'
import type { Stage } from '../mascot/stage'
import type { Mood } from '../mascot/mood'

const STAGES: Stage[] = ['INTERN', 'JUNIOR', 'SENIOR', 'CHIEF']
const STAGE_LABEL: Record<Stage, string> = { INTERN: '인턴', JUNIOR: '주니어', SENIOR: '시니어', CHIEF: '치프' }
const MOOD_LABEL: Record<Mood, string> = { ENERGIZED: '쌩쌩', NORMAL: '평온', TIRED: '지침', ASLEEP: '수면' }

export function MascotZone({ state }: { state: MascotState }) {
  const actualIndex = STAGES.indexOf(state.stage)
  const [preview, setPreview] = useState(actualIndex)
  const stage = STAGES[preview]
  const pct = state.xpForLevel > 0 ? Math.round((state.xpInLevel / state.xpForLevel) * 100) : 0

  return (
    <section
      className="relative mx-auto max-w-[1831px] overflow-hidden px-6 py-16 sm:px-10"
      style={{ background: `radial-gradient(120% 80% at 50% 120%, ${state.tint}55 0%, transparent 70%)` }}
    >
      {/* ghost level text */}
      <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
        <span aria-hidden="true" className="select-none font-grotesk uppercase leading-none text-white/5" style={{ fontSize: 'clamp(80px, 20vw, 260px)' }}>
          {state.level}
        </span>
      </div>

      <div className="relative flex flex-col items-center gap-6">
        <div className="flex items-center gap-6">
          <button
            aria-label="이전 단계"
            onClick={() => setPreview((p) => (p + STAGES.length - 1) % STAGES.length)}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/40 text-cream transition hover:bg-white/10"
          >
            <ArrowLeft size={22} />
          </button>

          <div className="flex flex-col items-center">
            <div className="text-[96px] leading-none transition-transform duration-[650ms] sm:text-[140px]">
              {mascotArt(state.speciesId, stage)}
            </div>
            <p className="mt-2 font-mono text-xs uppercase text-cream/70">{STAGE_LABEL[stage]} 단계</p>
          </div>

          <button
            aria-label="다음 단계"
            onClick={() => setPreview((p) => (p + 1) % STAGES.length)}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/40 text-cream transition hover:bg-white/10"
          >
            <ArrowRight size={22} />
          </button>
        </div>

        <LiquidGlass className="w-full max-w-md rounded-[24px]">
          <div className="flex flex-col gap-3 p-6">
            <div className="flex items-baseline justify-between">
              <span className="font-grotesk text-2xl uppercase">{state.name}</span>
              <span className="font-grotesk text-xl uppercase text-neon">Lv. {state.level}</span>
            </div>
            <div>
              <div className="mb-1 flex justify-between font-mono text-[11px] uppercase text-cream/70">
                <span>XP</span>
                <span>{state.xpInLevel} / {state.xpForLevel}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-neon transition-[width] duration-[650ms]" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="flex justify-between font-mono text-xs uppercase text-cream/80">
              <span>현재 {STAGE_LABEL[state.stage]}</span>
              <span>기분 {MOOD_LABEL[state.mood]}</span>
              <span>{state.streakDays}일 연속</span>
            </div>
          </div>
        </LiquidGlass>
      </div>
    </section>
  )
}
