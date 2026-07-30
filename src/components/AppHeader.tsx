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
    <header className="resq-app-header">
      <div className="resq-app-header__inner">
        <AppLink
          to="home"
          aria-label="ResQ 홈"
          className="resq-app-brand"
        >
          ResQ
        </AppLink>
        <nav aria-label="주요 페이지" className="resq-app-nav">
          <ul className="resq-app-nav__list">
            {NAV.map(({ route: itemRoute, Icon }) => {
              const active = route === itemRoute
              return (
                <li key={itemRoute}>
                  <AppLink
                    to={itemRoute}
                    aria-current={active ? 'page' : undefined}
                    className={`resq-nav-link ${active ? 'resq-nav-link--active' : ''}`}
                  >
                    <Icon aria-hidden size={17} strokeWidth={1.9} />
                    {ROUTE_LABEL[itemRoute]}
                  </AppLink>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="resq-app-actions">
          <span className="resq-profile-name">
            {profile.nickname}
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="설정"
            title="설정"
            className="resq-icon-button resq-icon-button--settings"
          >
            <Settings aria-hidden size={18} />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="로그아웃"
            title="로그아웃"
            className="resq-icon-button resq-icon-button--danger"
          >
            <LogOut aria-hidden size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
