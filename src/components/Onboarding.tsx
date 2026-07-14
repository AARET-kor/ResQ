import { useState, type FormEvent } from 'react'
import { LiquidGlass } from './LiquidGlass'

export interface OnboardingValues {
  hospital: string
  specialty: string
  pgy: number
  nickname: string
  training_start: string
  training_end: string
}

const FIELDS: { key: keyof Omit<OnboardingValues, 'pgy'>; label: string; type: string }[] = [
  { key: 'hospital', label: '병원', type: 'text' },
  { key: 'specialty', label: '전공', type: 'text' },
  { key: 'nickname', label: '닉네임', type: 'text' },
  { key: 'training_start', label: '수련 시작일', type: 'date' },
  { key: 'training_end', label: '수련 종료일', type: 'date' },
]

export function Onboarding({
  onSubmit,
  error,
}: {
  onSubmit: (v: OnboardingValues) => void
  error?: string | null
}) {
  const [text, setText] = useState<Record<string, string>>({})
  const [pgy, setPgy] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const required = ['hospital', 'specialty', 'nickname', 'training_start', 'training_end']
    if (required.some((k) => !text[k]) || !pgy) return
    onSubmit({
      hospital: text.hospital,
      specialty: text.specialty,
      pgy: Number(pgy),
      nickname: text.nickname,
      training_start: text.training_start,
      training_end: text.training_end,
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <LiquidGlass className="w-full max-w-md rounded-[28px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8">
          <h1 className="font-grotesk text-3xl uppercase">Welcome to ResQ</h1>
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 font-mono text-xs uppercase text-cream/80">
              {f.label}
              <input
                aria-label={f.label}
                type={f.type}
                value={text[f.key] ?? ''}
                onChange={(e) => setText((s) => ({ ...s, [f.key]: e.target.value }))}
                className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-cream/80">
            연차
            <input
              aria-label="연차"
              type="number"
              min={1}
              max={5}
              value={pgy}
              onChange={(e) => setPgy(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon"
            />
          </label>
          {error && <p role="alert" className="font-mono text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            className="mt-2 rounded-md bg-neon px-4 py-3 font-grotesk text-sm uppercase text-bg transition hover:opacity-90"
          >
            ResQ 시작하기
          </button>
        </form>
      </LiquidGlass>
    </main>
  )
}
