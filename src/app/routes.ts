import { useEffect, useState } from 'react'

export type AppRoute = 'home' | 'plan' | 'team' | 'papers' | 'integrations'

export const ROUTE_PATH: Record<AppRoute, string> = {
  home: '/',
  plan: '/plan',
  team: '/team',
  papers: '/papers',
  integrations: '/integrations',
}

export const ROUTE_LABEL: Record<AppRoute, string> = {
  home: '홈',
  plan: '일정 · 할 일',
  team: '팀',
  papers: '논문',
  integrations: '연동',
}

const PATH_ROUTE = new Map(
  Object.entries(ROUTE_PATH).map(([route, path]) => [path, route as AppRoute]),
)

function routeFromLocation(): AppRoute {
  const legacyHash = window.location.hash
  if (legacyHash === '#schedule') return 'plan'
  if (legacyHash === '#team') return 'team'
  if (legacyHash === '#papers') return 'papers'
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return PATH_ROUTE.get(path) ?? 'home'
}

export function navigateTo(route: AppRoute, replace = false): void {
  const path = ROUTE_PATH[route]
  if (replace) window.history.replaceState({}, '', path)
  else window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation())

  useEffect(() => {
    const legacyRoute = routeFromLocation()
    if (window.location.hash && ['#schedule', '#team', '#papers'].includes(window.location.hash)) {
      navigateTo(legacyRoute, true)
    }
    const update = () => setRoute(routeFromLocation())
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [route])

  return route
}
