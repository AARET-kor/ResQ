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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#020817]/90 backdrop-blur-xl">
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
                    className={`flex items-center gap-1.5 rounded-full px-3 py-2 font-mono text-[10px] transition sm:px-4 ${
                      active
                        ? 'bg-neon text-bg'
                        : 'text-cream/55 hover:bg-white/10 hover:text-cream'
                    }`}
                  >
                    <Icon size={13} />
                    {ROUTE_LABEL[itemRoute]}
                  </AppLink>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden max-w-32 truncate font-mono text-[10px] text-cream/40 lg:block">
            {profile.nickname}
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="설정"
            title="설정"
            className="flex h-9 w-9 items-center justify-center rounded-full text-cream/55 transition hover:bg-white/10 hover:text-neon"
          >
            <Settings size={15} />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="로그아웃"
            title="로그아웃"
            className="flex h-9 w-9 items-center justify-center rounded-full text-cream/55 transition hover:bg-white/10 hover:text-red-300"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
