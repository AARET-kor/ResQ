import { Mail, Bird, Globe } from 'lucide-react'
import { LiquidGlass } from './LiquidGlass'
import { computeDday } from '../lib/dday'
import type { Profile } from '../lib/profile'

const NAV = [
  { label: '홈', active: true },
  { label: '논문', active: true },
  { label: '캘린더', active: false },
  { label: '메일', active: false },
  { label: '설정', active: true },
]

const HERO_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260331_045634_e1c98c76-1265-4f5c-882a-4276f2080894.mp4'

export function Hero({
  profile,
  onSignOut,
  now = new Date(),
}: {
  profile: Profile
  onSignOut: () => void
  now?: Date
}) {
  const { daysLeft, percent } = computeDday(
    new Date(profile.training_start ?? now),
    new Date(profile.training_end ?? now),
    now,
  )

  return (
    <section className="relative min-h-screen overflow-hidden rounded-b-[32px]">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={HERO_VIDEO}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1831px] flex-col px-6 py-8 sm:px-10">
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

        <div className="relative mt-auto max-w-[780px] lg:ml-32">
          <p className="font-mono text-sm uppercase text-cream/80">
            {profile.pgy}년차 · {profile.hospital} {profile.specialty}
          </p>
          <h1 className="font-grotesk text-[40px] uppercase leading-[1.05] sm:text-[60px] md:text-[75px] lg:text-[90px] lg:leading-[1]">
            안녕, {profile.nickname}
          </h1>
          <p className="absolute -right-4 top-0 -rotate-1 font-condiment text-2xl text-neon opacity-90 mix-blend-exclusion sm:text-4xl md:text-5xl">
            resident life
          </p>

          <div className="mt-8 max-w-md">
            <div className="flex items-baseline justify-between font-grotesk uppercase">
              <span className="text-3xl text-neon sm:text-4xl">D-{daysLeft}</span>
              <span className="font-mono text-xs text-cream/70">
                수련 {percent.toFixed(1)}% 진행
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-neon" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="mt-8 font-mono text-xs uppercase text-cream/50 underline transition hover:text-neon"
          >
            로그아웃
          </button>
        </div>
      </div>
    </section>
  )
}
