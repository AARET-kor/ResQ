import type {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactNode,
} from 'react'
import {
  navigateTo,
  ROUTE_PATH,
  type AppRoute,
} from './routes'

export function AppLink({
  to,
  children,
  onClick,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: AppRoute
  children: ReactNode
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return
    event.preventDefault()
    navigateTo(to)
  }

  return (
    <a href={ROUTE_PATH[to]} onClick={handleClick} {...props}>
      {children}
    </a>
  )
}
