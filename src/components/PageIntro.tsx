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
    <div className="page-intro">
      <div className="page-intro__copy">
        <p className="page-intro__eyebrow">{eyebrow}</p>
        <h1 className="page-intro__title">{title}</h1>
        <p className="page-intro__description">{description}</p>
      </div>
      {action}
    </div>
  )
}
