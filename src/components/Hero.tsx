import { useState, type MouseEvent } from 'react'
import { Mail, Bird, Globe, ArrowLeft, ArrowRight } from 'lucide-react'
import { LiquidGlass } from './LiquidGlass'
import { computeDday } from '../lib/dday'
import { timeOfDayKST, SKY } from '../mascot/daylight'
import { mascotArt } from '../mascot/mascotAssets'
import type { MascotState } from '../mascot/state'
import type { Stage } from '../mascot/stage'
import type { Mood } from '../mascot/mood'
import type { Profile } from '../lib/profile'

const NAV = [
  { label: '홈', active: true },
  { label: '논문', active: true },
  { label: '캘린더', active: false },
  { label: '메일', active: false },
  { label: '설정', active: true },
]

const STAGES: Stage[] = ['INTERN', 'JUNIOR', 'SENIOR', 'CHIEF']
const STAGE_LABEL: Record<Stage, string> = { INTERN: '인턴', JUNIOR: '주니어', SENIOR: '시니어', CHIEF: '치프' }
const MOOD_LABEL: Record<Mood, string> = { ENERGIZED: '쌩쌩', NORMAL: '평온', TIRED: '지침', ASLEEP: '수면' }

export function Hero({
  profile,
  mascot,
  onSignOut,
  now = new Date(),
}: {
  profile: Profile
  mascot: MascotState | null
  onSignOut: () => void
  now?: Date
}) {
  const { daysLeft, percent } = computeDday(
    new Date(profile.training_start ?? now),
    new Date(profile.training_end ?? now),
    now,
  )
  const phase = timeOfDayKST(now)
  const actualIndex = mascot ? STAGES.indexOf(mascot.stage) : 0
  const [preview, setPreview] = useState(actualIndex)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const previewStage = STAGES[preview]
  const pct = mascot && mascot.xpForLevel > 0 ? Math.round((mascot.xpInLevel / mascot.xpForLevel) * 100) : 0

  const onMouseMove = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setParallax({
      x: ((e.clientX - r.left) / r.width - 0.5) * 16,
      y: ((e.clientY - r.top) / r.height - 0.5) * 10,
    })
  }

  return (
    <section
      onMouseMove={onMouseMove}
      className="relative min-h-screen overflow-hidden rounded-b-[32px]"
      style={{ background: SKY[phase] }}
    >
      {/* specialty tint blend + night stars (pure CSS decorations) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: mascot
            ? `radial-gradient(120% 70% at 50% 115%, ${mascot.tint}44 0%, transparent 65%)`
            : undefined,
        }}
      />
      {phase === 'NIGHT' && (
        <div aria-hidden className="absolute inset-0 opacity-70">
          {[[12, 18], [28, 9], [45, 22], [63, 12], [78, 26], [88, 8], [70, 40], [20, 38]].map(([l, t], i) => (
            <span
              key={i}
              className="absolute h-[2px] w-[2px] rounded-full bg-cream/80"
              style={{ left: `${l}%`, top: `${t}%` }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1831px] flex-col px-6 py-8 sm:px-10">
        {/* Header (unchanged) */}
        <header className="flex items-center justify-between">
          <span className="font-grotesk text-base uppercase">ResQ</span>
          <nav className="hidden lg:block">
            <LiquidGlass className="rounded-[28px]">
              <ul className="flex gap-8 px-[52px] py-[24px]">
                {NAV.map((n) => (
                  <li key={n.label}>
                    <a
                      href="#"
                      aria-disabled={!n.active}
                      className={`font-grotesk text-[13px] uppercase transition ${
                        n.active ? 'hover:text-neon' : 'cursor-not-allowed text-cream/40'
                      }`}
                    >
                      {n.label}
                      {!n.active && <span className="ml-1 text-[9px]">(곧)</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </LiquidGlass>
          </nav>
          <div className="hidden gap-2 lg:flex">
            {[Mail, Bird, Globe].map((Icon, i) => (
              <LiquidGlass key={i} className="rounded-[1rem]">
                <button className="flex h-[56px] w-[56px] items-center justify-center transition hover:bg-white/10">
                  <Icon size={20} />
                </button>
              </LiquidGlass>
            ))}
          </div>
        </header>

        {/* Info block (top-left, compact) */}
        <div className="mt-10 max-w-sm">
          <p className="font-mono text-sm uppercase text-cream/80">
            {profile.pgy}년차 · {profile.hospital} {profile.specialty}
          </p>
          <h1 className="font-grotesk text-[34px] uppercase leading-[1.05] sm:text-[44px]">
            안녕, {profile.nickname}
          </h1>
          <div className="mt-4">
            <div className="flex items-baseline justify-between font-grotesk uppercase">
              <span className="text-2xl text-neon sm:text-3xl">D-{daysLeft}</span>
              <span className="font-mono text-xs text-cream/70">수련 {percent.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-neon" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>

        {/* Mascot center stage */}
        {mascot && (
          <div className="relative flex flex-1 flex-col items-center justify-center py-8">
            <span
              aria-hidden
              className="pointer-events-none absolute select-none font-grotesk uppercase leading-none text-white/5"
              style={{ fontSize: 'clamp(90px, 24vw, 300px)' }}
            >
              {mascot.speciesLabel}
            </span>
            <div
              className="relative"
              style={{ transform: `translate(${parallax.x}px, ${parallax.y}px)`, transition: 'transform 200ms ease-out' }}
            >
              <div className="qbi-float text-[110px] leading-none drop-shadow-2xl sm:text-[170px]">
                {mascotArt(mascot.speciesId, previewStage)}
              </div>
              <div
                aria-hidden
                className="mx-auto mt-2 h-4 w-32 rounded-full bg-black/40 blur-md sm:w-44"
              />
            </div>
          </div>
        )}
        {!mascot && <div className="flex-1" />}

        {/* Stat bar */}
        {mascot && (
          <LiquidGlass className="mx-auto w-full max-w-2xl rounded-[24px]">
            <div className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <span className="font-grotesk text-xl uppercase">
                  {mascot.name}
                  <span className="ml-2 font-mono text-xs normal-case" style={{ color: mascot.variantAccent }}>
                    {mascot.variantLabel} {mascot.speciesLabel}
                  </span>
                </span>
                <span className="font-grotesk text-lg uppercase text-neon">Lv. {mascot.level}</span>
              </div>
              <div>
                <div className="mb-1 flex justify-between font-mono text-[11px] uppercase text-cream/70">
                  <span>XP</span>
                  <span>{mascot.xpInLevel} / {mascot.xpForLevel}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-neon transition-[width] duration-[650ms]" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between font-mono text-xs uppercase text-cream/80">
                <span>현재 {STAGE_LABEL[mascot.stage]}</span>
                <span className="flex items-center gap-2">
                  <button
                    aria-label="이전 단계"
                    onClick={() => setPreview((p) => (p + STAGES.length - 1) % STAGES.length)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  {STAGE_LABEL[previewStage]} 프리뷰
                  <button
                    aria-label="다음 단계"
                    onClick={() => setPreview((p) => (p + 1) % STAGES.length)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10"
                  >
                    <ArrowRight size={14} />
                  </button>
                </span>
                <span>기분 {MOOD_LABEL[mascot.mood]}</span>
                <span>{mascot.streakDays}일 연속</span>
              </div>
            </div>
          </LiquidGlass>
        )}

        <div className="mt-6 flex justify-center">
          <button
            onClick={onSignOut}
            className="font-mono text-xs uppercase text-cream/50 underline transition hover:text-neon"
          >
            로그아웃
          </button>
        </div>
      </div>
    </section>
  )
}
