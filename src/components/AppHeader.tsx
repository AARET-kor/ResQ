import {
  CalendarRange,
  Cable,
  Home,
  LogOut,
  Microscope,
  Settings,
  UsersRound,
} from 'lucide-react'
import type { Profile } from '../lib/profile'
import { AppLink } from '../app/AppLink'
import { ROUTE_LABEL, type AppRoute } from '../app/routes'
import { ThemeToggle } from '../theme/ThemeToggle'

const NAV: Array<{
  route: AppRoute
  Icon: typeof Home
}> = [
  { route: 'home', Icon: Home },
  { route: 'plan', Icon: CalendarRange },
  { route: 'team', Icon: UsersRound },
  { route: 'papers', Icon: Microscope },
  { route: 'integrations', Icon: Cable },
]

export function AppHeader({
  route,
  profile,
  onOpenSettings,
  onSignOut,
}: {
  route: AppRoute
  profile: Profile
  onOpenSettings: () => void
  onSignOut: () => void
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-canvas/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-8">
        <AppLink
          to="home"
          aria-label="ResQ 홈"
          className="mr-1 shrink-0 font-grotesk text-lg uppercase tracking-tight text-neon"
        >
          ResQ
        </AppLink>
        <nav aria-label="주요 페이지" className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex min-w-max items-center gap-1">
            {NAV.map(({ route: itemRoute, Icon }) => {
              const active = route === itemRoute
              return (
                <li key={itemRoute}>
                  <AppLink
                    to={itemRoute}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-2 font-sans text-sm transition sm:px-4 ${
                      active
                        ? 'bg-accent text-accentInk'
                        : 'text-ink/70 hover:bg-surfaceRaised hover:text-ink'
                    }`}
                  >
                    <Icon size={15} />
                    {ROUTE_LABEL[itemRoute]}
                  </AppLink>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden max-w-32 truncate font-sans text-sm text-ink/65 lg:block">
            {profile.nickname}
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="설정"
            title="설정"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink/70 transition hover:bg-surfaceRaised hover:text-accent"
          >
            <Settings size={17} />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="로그아웃"
            title="로그아웃"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink/70 transition hover:bg-surfaceRaised hover:text-red-500"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  )
}
