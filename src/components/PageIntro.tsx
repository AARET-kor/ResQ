import type { ReactNode } from 'react'

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.24em] text-neon">
          {eyebrow}
        </p>
        <h1 className="font-grotesk text-4xl uppercase leading-none sm:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl font-mono text-xs leading-relaxed text-cream/55">
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}
