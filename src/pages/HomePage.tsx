import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  Cable,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Microscope,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { AppLink } from '../app/AppLink'
import { ROUTE_LABEL, type AppRoute } from '../app/routes'
import { LiquidGlass } from '../components/LiquidGlass'
import { UnifiedTimeline } from '../components/sections/UnifiedTimeline'
import { useIntegrationSources } from '../home/hooks/useIntegrationSources'
import { useSchedule } from '../home/hooks/useSchedule'
import { useTeam } from '../home/hooks/useTeam'
import { useTodos } from '../home/hooks/useTodos'
import type { Profile } from '../lib/profile'
import { journalsFor } from '../lib/sources'

const FEATURE_CARDS: Array<{
  route: Exclude<AppRoute, 'home'>
  number: string
  title: string
  description: string
  Icon: typeof CalendarCheck2
  accent: string
}> = [
  {
    route: 'plan',
    number: '01',
    title: '오늘의 계획',
    description: '일정과 할 일을 분리해서 입력하고, 통합 타임라인에서 하루의 흐름을 읽습니다.',
    Icon: CalendarCheck2,
    accent: 'var(--accent-plan)',
  },
  {
    route: 'team',
    number: '02',
    title: '팀 미션',
    description: '팀 과제의 담당자와 상태, 권한, 변경 이력을 한 공간에서 관리합니다.',
    Icon: UsersRound,
    accent: 'var(--accent-team)',
  },
  {
    route: 'papers',
    number: '03',
    title: '논문 Breakdown',
    description: '신뢰할 수 있는 연구를 찾고 PDF 분석, 아이디에이션, 후속 탐색으로 이어갑니다.',
    Icon: Microscope,
    accent: 'var(--accent-paper)',
  },
  {
    route: 'integrations',
    number: '04',
    title: '연동 허브',
    description: '이미 쓰던 캘린더와 할 일 앱을 연결하고, 원본을 유지한 채 ResQ에서 통합합니다.',
    Icon: Cable,
    accent: 'var(--accent-connect)',
  },
]

function todayKst(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function HomePage({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}) {
  const todos = useTodos({ profile, onProfileChange })
  const schedule = useSchedule(profile.id)
  const team = useTeam(profile)
  const { sources } = useIntegrationSources(profile.id)
  const today = todayKst()
  const openTodos = todos.todos.filter((todo) => !todo.done)
  const todayTodos = openTodos.filter((todo) => todo.due_date === today)
  const todayEvents = schedule.events.filter((event) => event.starts_at.slice(0, 10) === today)
  const activeTeamTasks = team.tasks.filter((task) => task.status !== 'done')
  const selectedSources = sources.filter((source) => source.selected)
  const connectedProviders = new Set(selectedSources.map((source) => source.provider)).size
  const journals = journalsFor(profile.specialty).slice(0, 6)

  const stats = [
    {
      label: '오늘 일정',
      value: todayEvents.length,
      detail: todayEvents[0]?.title ?? '오늘 등록된 일정 없음',
      Icon: Clock3,
    },
    {
      label: '오늘 마감',
      value: todayTodos.length,
      detail: openTodos.length ? `미완료 전체 ${openTodos.length}건` : '모든 할 일 완료',
      Icon: CheckCircle2,
    },
    {
      label: '팀 진행',
      value: activeTeamTasks.length,
      detail: team.team?.name ?? '아직 연결된 팀 없음',
      Icon: UsersRound,
    },
    {
      label: '연동 출처',
      value: connectedProviders,
      detail: selectedSources.length ? `선택 목록 ${selectedSources.length}개` : '연동 허브에서 연결',
      Icon: Cable,
    },
  ]

  return (
    <>
      <div className="home-dashboard-nav sticky top-0 z-40 border-b border-line/70 bg-canvas/88 px-4 py-3 backdrop-blur-xl">
        <nav aria-label="홈 빠른 이동" className="mx-auto max-w-[1500px] overflow-x-auto">
          <ul className="flex min-w-max items-center justify-center gap-2">
            {(['plan', 'team', 'papers', 'integrations'] as const).map((route) => (
              <li key={route}>
                <AppLink
                  to={route}
                  className="home-dashboard-nav__link block rounded-full border border-cream/15 px-4 py-2 font-sans text-sm text-cream/75 transition hover:border-neon/50 hover:text-neon"
                >
                  {ROUTE_LABEL[route]}
                </AppLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mx-auto flex max-w-[1500px] flex-col gap-28 px-5 py-20 sm:px-8 sm:py-28">
        <section aria-labelledby="briefing-title">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="home-briefing-eyebrow font-sans text-sm uppercase tracking-[0.24em]">
                Today at a glance
              </p>
              <h2 id="briefing-title" className="mt-2 font-grotesk text-4xl uppercase sm:text-6xl">
                오늘의 브리핑
              </h2>
            </div>
            <p className="max-w-md font-sans text-sm leading-relaxed text-cream/65">
              홈에서는 상태만 빠르게 읽고, 실제 입력과 관리는 각 기능 페이지에서 집중해서 처리합니다.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ label, value, detail, Icon }) => (
              <LiquidGlass key={label} className="rounded-2xl">
                <div className="flex min-h-40 flex-col justify-between p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-sm uppercase text-cream/65">{label}</span>
                    <Icon size={16} className="text-neon" />
                  </div>
                  <div>
                    <strong className="font-grotesk text-5xl font-normal text-cream">{value}</strong>
                    <p className="mt-2 truncate font-sans text-sm text-cream/65">{detail}</p>
                  </div>
                </div>
              </LiquidGlass>
            ))}
          </div>
        </section>

        <section aria-labelledby="timeline-title">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="font-sans text-sm uppercase tracking-[0.24em]" style={{ color: 'var(--accent-team)' }}>
                Unified flow
              </p>
              <h2 id="timeline-title" className="mt-2 font-grotesk text-4xl uppercase sm:text-6xl">
                하루의 흐름
              </h2>
            </div>
            <AppLink
              to="plan"
              className="hidden items-center gap-2 font-sans text-sm uppercase text-cream/70 transition hover:text-neon sm:flex"
            >
              자세히 관리 <ArrowRight size={13} />
            </AppLink>
          </div>
          <UnifiedTimeline events={schedule.events} todos={todos.todos} sources={sources} />
        </section>

        <section aria-labelledby="workspace-title">
          <div className="mb-10 max-w-3xl">
            <p className="font-sans text-sm uppercase tracking-[0.24em]" style={{ color: 'var(--accent-paper)' }}>
              Focused workspaces
            </p>
            <h2 id="workspace-title" className="mt-2 font-grotesk text-4xl uppercase sm:text-6xl">
              기능마다<br />자기만의 공간
            </h2>
            <p className="mt-5 font-sans text-sm leading-relaxed text-cream/70">
              한 화면을 끝없이 내려가며 기능을 찾지 않아도 됩니다. 필요한 작업을 고르면 전용 페이지에서 관련 정보와 조작만 만납니다.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {FEATURE_CARDS.map(({ route, number, title, description, Icon, accent }) => (
              <AppLink
                key={route}
                to={route}
                className="group relative min-h-72 overflow-hidden rounded-3xl border border-line/60 bg-surface p-6 shadow-sm transition hover:-translate-y-1 hover:border-line sm:p-8"
              >
                <div
                  aria-hidden
                  className="absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-20 blur-3xl transition group-hover:scale-125"
                  style={{ backgroundColor: accent }}
                />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <span className="font-sans text-xs" style={{ color: accent }}>{number}</span>
                    <Icon size={27} style={{ color: accent }} />
                  </div>
                  <div>
                    <h3 className="font-grotesk text-3xl uppercase sm:text-4xl">{title}</h3>
                    <p className="mt-3 max-w-lg font-sans text-sm leading-relaxed text-cream/65">
                      {description}
                    </p>
                    <span className="mt-6 inline-flex items-center gap-2 font-sans text-sm uppercase text-cream/70 transition group-hover:text-cream">
                      페이지 열기 <ArrowRight size={13} />
                    </span>
                  </div>
                </div>
              </AppLink>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]" aria-labelledby="research-home-title">
          <div className="rounded-3xl border border-line/60 bg-surface p-7 shadow-sm sm:p-10">
            <div className="flex items-center gap-2" style={{ color: 'var(--accent-paper)' }}>
              <Microscope size={18} />
              <span className="font-sans text-sm uppercase tracking-[0.2em]">Research pulse</span>
            </div>
            <h2 id="research-home-title" className="mt-8 font-grotesk text-4xl uppercase sm:text-6xl">
              {profile.specialty}<br />근거를 놓치지 않게
            </h2>
            <p className="mt-5 max-w-xl font-sans text-sm leading-relaxed text-cream/70">
              핵심 의학 저널과 전공 학회지를 함께 탐색하고, 선택한 논문을 분석 보고서와 연구 아이디어로 발전시킵니다.
            </p>
            <AppLink
              to="papers"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#FFB86B] px-5 py-3 font-grotesk text-xs uppercase text-[#07111f] transition hover:opacity-90"
            >
              논문 워크스페이스 <ArrowRight size={14} />
            </AppLink>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-line/60 bg-surface p-7 shadow-sm sm:p-10">
            <div className="flex items-center justify-between">
              <span className="font-sans text-sm uppercase text-cream/65">Curated sources</span>
              <BookOpenCheck size={16} style={{ color: 'var(--accent-paper)' }} />
            </div>
            <div className="mt-4 flex flex-1 flex-col justify-center gap-3">
              {journals.map((journal, index) => (
                <div key={journal.id} className="flex items-center gap-4 border-b border-cream/10 pb-3">
                  <span className="font-sans text-sm text-muted">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-sans text-xs text-cream/70">
                    {journal.label}
                  </span>
                  {journal.oa && (
                    <span className="rounded-full bg-neon/10 px-2 py-1 font-sans text-xs text-neon">OA</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-line/60 bg-gradient-to-br from-surface to-surfaceRaised p-7 shadow-sm sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <div className="flex items-center gap-2" style={{ color: 'var(--accent-connect)' }}>
                <Activity size={17} />
                <span className="font-sans text-sm uppercase tracking-[0.2em]">Connected by design</span>
              </div>
              <h2 className="mt-6 font-grotesk text-4xl uppercase sm:text-6xl">
                원본 앱은 그대로<br />흐름만 하나로
              </h2>
            </div>
            <div>
              <p className="font-sans text-sm leading-relaxed text-cream/70">
                Google Calendar·Tasks, Outlook·Microsoft To Do, Todoist, Apple·Galaxy 기기 캘린더와 ICS·CalDAV를 출처별로 구분합니다. 읽기 전용과 양방향 모드를 목록마다 선택할 수 있습니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Google', 'Outlook', 'Todoist', 'Apple', 'Galaxy', 'ICS', 'CalDAV'].map((provider) => (
                  <span key={provider} className="rounded-full border border-cream/15 px-3 py-2 font-sans text-xs text-cream/70">
                    {provider}
                  </span>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-4">
                <AppLink
                  to="integrations"
                  className="inline-flex items-center gap-2 rounded-full bg-[#B9A2FF] px-5 py-3 font-grotesk text-xs uppercase text-[#07111f]"
                >
                  연동 관리 <ArrowRight size={14} />
                </AppLink>
                <div className="flex items-center gap-2 font-sans text-sm text-cream/65">
                  <ShieldCheck size={14} className="text-neon" />
                  원문·메모 최소 수집
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-10 text-center">
          <HeartPulse size={28} className="mx-auto text-neon" />
          <p className="mt-6 font-sans text-sm uppercase tracking-[0.28em] text-muted">
            Built for the work around care
          </p>
          <h2 className="mx-auto mt-4 max-w-4xl font-grotesk text-4xl uppercase leading-tight sm:text-7xl">
            진료 판단이 아니라<br />
            <span className="text-neon">업무의 여유를 위한 도구</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl font-sans text-sm leading-relaxed text-cream/65">
            반복되는 일정 정리, 팀 조율, 논문 탐색을 덜어내고 중요한 판단에 더 집중할 수 있도록 설계했습니다.
          </p>
          <AppLink
            to="plan"
            className="mt-9 inline-flex items-center gap-2 rounded-full border border-accent/60 px-6 py-3 font-grotesk text-xs uppercase text-accent transition hover:bg-accent hover:text-accentInk"
          >
            오늘 시작하기 <Sparkles size={14} />
          </AppLink>
        </section>
      </div>
    </>
  )
}
