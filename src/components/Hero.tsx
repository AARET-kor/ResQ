import { useEffect, useState, type CSSProperties } from 'react'
import { Mail, Bird, Globe, ArrowLeft, ArrowRight } from 'lucide-react'
import { LiquidGlass } from './LiquidGlass'
import { computeDday } from '../lib/dday'
import { timeOfDayKST, type DayPhase } from '../mascot/daylight'
import { mascotArt, STAGE_ART } from '../mascot/mascotAssets'
import type { MascotState } from '../mascot/state'
import type { Stage } from '../mascot/stage'
import type { Mood } from '../mascot/mood'
import type { Profile } from '../lib/profile'

const NAV = [
  { label: '홈', href: '#', active: true },
  { label: '논문', href: '#papers', active: true },
  { label: '캘린더', href: '#schedule', active: true },
  { label: '메일', href: '#', active: false },
  { label: '설정', href: '#', active: true },
]

const STAGES: Stage[] = ['INTERN', 'JUNIOR', 'SENIOR', 'CHIEF']
const STAGE_LABEL: Record<Stage, string> = { INTERN: '인턴', JUNIOR: '주니어', SENIOR: '시니어', CHIEF: '치프' }
const MOOD_LABEL: Record<Mood, string> = { ENERGIZED: '쌩쌩', NORMAL: '평온', TIRED: '지침', ASLEEP: '수면' }

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
const CAROUSEL_TRANSITION = `transform 650ms ${EASE}, filter 650ms ${EASE}, opacity 650ms ${EASE}, left 650ms ${EASE}, height 650ms ${EASE}, bottom 650ms ${EASE}`

// KST 낮/밤 톤을 피규어 배경색 위에 오버레이 (밤일수록 어둡게).
const PHASE_OVERLAY: Record<DayPhase, string> = {
  DAWN: 'linear-gradient(180deg, rgba(26,33,81,0.40) 0%, rgba(217,138,106,0.18) 100%)',
  DAY: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)',
  DUSK: 'linear-gradient(180deg, rgba(16,22,67,0.45) 0%, rgba(232,115,74,0.22) 100%)',
  NIGHT: 'linear-gradient(180deg, rgba(1,8,40,0.68) 0%, rgba(1,8,40,0.42) 100%)',
}

type Role = 'center' | 'left' | 'right' | 'back'

function roleStyle(role: Role, isMobile: boolean): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    aspectRatio: '0.6 / 1',
    transition: CAROUSEL_TRANSITION,
    willChange: 'transform, filter, opacity',
  }
  switch (role) {
    case 'center':
      return {
        ...base,
        left: '50%',
        transform: `translateX(-50%) scale(${isMobile ? 1.25 : 1.68})`,
        filter: 'none',
        opacity: 1,
        zIndex: 20,
        height: isMobile ? '52%' : '78%',
        bottom: isMobile ? '24%' : '10%',
      }
    case 'left':
      return {
        ...base,
        left: isMobile ? '20%' : '30%',
        transform: 'translateX(-50%) scale(1)',
        filter: 'blur(2px)',
        opacity: 0.85,
        zIndex: 10,
        height: isMobile ? '16%' : '26%',
        bottom: isMobile ? '34%' : '18%',
      }
    case 'right':
      return {
        ...base,
        left: isMobile ? '80%' : '70%',
        transform: 'translateX(-50%) scale(1)',
        filter: 'blur(2px)',
        opacity: 0.85,
        zIndex: 10,
        height: isMobile ? '16%' : '26%',
        bottom: isMobile ? '34%' : '18%',
      }
    case 'back':
      return {
        ...base,
        left: '50%',
        transform: 'translateX(-50%) scale(1)',
        filter: 'blur(4px)',
        opacity: 1,
        zIndex: 5,
        height: isMobile ? '13%' : '20%',
        bottom: isMobile ? '34%' : '18%',
      }
  }
}

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
  const [active, setActive] = useState(actualIndex)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Preload all stage figurines so carousel rotation never pops.
  useEffect(() => {
    for (const s of STAGES) {
      const img = new Image()
      img.src = STAGE_ART[s].src
    }
  }, [])

  const navigate = (dir: 'next' | 'prev') => {
    if (isAnimating) return
    setIsAnimating(true)
    setActive((p) => (dir === 'next' ? (p + 1) % STAGES.length : (p + STAGES.length - 1) % STAGES.length))
    window.setTimeout(() => setIsAnimating(false), 650)
  }

  const roleFor = (i: number): Role => {
    if (i === active) return 'center'
    if (i === (active + 1) % STAGES.length) return 'right'
    if (i === (active + 3) % STAGES.length) return 'left'
    return 'back'
  }

  const activeStage = STAGES[active]
  const pct = mascot && mascot.xpForLevel > 0 ? Math.round((mascot.xpInLevel / mascot.xpForLevel) * 100) : 0

  return (
    <section
      className="relative overflow-hidden rounded-b-[32px]"
      style={{
        backgroundColor: STAGE_ART[activeStage].bg,
        transition: `background-color 650ms ${EASE}`,
      }}
    >
      {/* KST day/night tint over the figurine background */}
      <div aria-hidden className="absolute inset-0" style={{ background: PHASE_OVERLAY[phase] }} />
      {phase === 'NIGHT' && (
        <div aria-hidden className="absolute inset-0 opacity-70">
          {[[12, 18], [28, 9], [45, 22], [63, 12], [78, 26], [88, 8], [70, 40], [20, 38]].map(([l, t], i) => (
            <span key={i} className="absolute h-[2px] w-[2px] rounded-full bg-cream/80"
              style={{ left: `${l}%`, top: `${t}%` }} />
          ))}
        </div>
      )}

      <div className="relative" style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Giant ghost text — animal name behind the figurines */}
        {mascot && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 flex select-none items-center justify-center"
            style={{ top: '16%', zIndex: 2 }}
          >
            <span
              className="whitespace-nowrap font-grotesk uppercase text-white"
              style={{ fontSize: 'clamp(90px, 26vw, 340px)', lineHeight: 1, letterSpacing: '-0.02em', opacity: 0.22 }}
            >
              {mascot.speciesLabel}
            </span>
          </div>
        )}

        {/* Figurine carousel */}
        {mascot && (
          <div className="absolute inset-0" style={{ zIndex: 3 }}>
            {STAGES.map((stage, i) => (
              <div key={stage} style={roleStyle(roleFor(i), isMobile)}>
                <img
                  src={mascotArt(mascot.speciesId, stage)}
                  alt={`${mascot.speciesLabel} 마스코트 ${STAGE_LABEL[stage]}`}
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom center' }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-8 sm:px-10" style={{ zIndex: 60 }}>
          <span className="font-grotesk text-base uppercase">ResQ</span>
          <nav className="hidden lg:block">
            <LiquidGlass className="rounded-[28px]">
              <ul className="flex gap-8 px-[52px] py-[24px]">
                {NAV.map((n) => (
                  <li key={n.label}>
                    <a
                      href={n.href}
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
          <div className="flex items-center gap-2">
            <div className="hidden gap-2 lg:flex">
              {[Mail, Bird, Globe].map((Icon, i) => (
                <LiquidGlass key={i} className="rounded-[1rem]">
                  <button className="flex h-[48px] w-[48px] items-center justify-center transition hover:bg-white/10">
                    <Icon size={18} />
                  </button>
                </LiquidGlass>
              ))}
            </div>
            <button
              onClick={onSignOut}
              className="ml-2 font-mono text-xs uppercase text-cream/60 underline transition hover:text-neon"
            >
              로그아웃
            </button>
          </div>
        </header>

        {/* Info block (top-left, under header) */}
        <div className="absolute left-6 top-28 max-w-xs sm:left-10 sm:top-32" style={{ zIndex: 60 }}>
          <p className="font-mono text-sm uppercase text-cream/90">
            {profile.pgy}년차 · {profile.hospital} {profile.specialty}
          </p>
          <h1 className="font-grotesk text-[30px] uppercase leading-[1.05] sm:text-[40px]">
            안녕, {profile.nickname}
          </h1>
          <div className="mt-3">
            <div className="flex items-baseline justify-between font-grotesk uppercase">
              <span className="text-2xl text-neon sm:text-3xl">D-{daysLeft}</span>
              <span className="font-mono text-xs text-cream/80">수련 {percent.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/20">
              <div className="h-full rounded-full bg-neon" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>

        {/* Bottom-left: stage caption + carousel arrows (TOONHUB controls) */}
        {mascot && (
          <div className="absolute bottom-6 left-4 sm:bottom-16 sm:left-16" style={{ zIndex: 60 }}>
            <p className="mb-2 font-grotesk text-base uppercase tracking-widest text-white/95 sm:mb-3 sm:text-[22px]">
              {STAGE_LABEL[activeStage]} 스테이지
            </p>
            <div className="flex gap-3">
              <button
                aria-label="이전 단계"
                onClick={() => navigate('prev')}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white text-white transition hover:scale-[1.08] hover:bg-white/10 sm:h-16 sm:w-16"
              >
                <ArrowLeft size={26} strokeWidth={2.25} />
              </button>
              <button
                aria-label="다음 단계"
                onClick={() => navigate('next')}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white text-white transition hover:scale-[1.08] hover:bg-white/10 sm:h-16 sm:w-16"
              >
                <ArrowRight size={26} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        )}

        {/* Bottom-right: stat bar */}
        {mascot && (
          <div className="absolute inset-x-4 bottom-24 sm:inset-x-auto sm:bottom-12 sm:right-10 sm:w-[420px]" style={{ zIndex: 60 }}>
            <LiquidGlass className="rounded-[24px]">
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
                  <div className="mb-1 flex justify-between font-mono text-[11px] uppercase text-cream/80">
                    <span>XP</span>
                    <span>{mascot.xpInLevel} / {mascot.xpForLevel}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/20">
                    <div className="h-full rounded-full bg-neon transition-[width] duration-[650ms]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between font-mono text-xs uppercase text-cream/90">
                  <span>현재 {STAGE_LABEL[mascot.stage]}</span>
                  <span>기분 {MOOD_LABEL[mascot.mood]}</span>
                  <span>{mascot.streakDays}일 연속</span>
                </div>
              </div>
            </LiquidGlass>
          </div>
        )}
      </div>
    </section>
  )
}
