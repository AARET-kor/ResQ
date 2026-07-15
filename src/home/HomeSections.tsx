import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'
import { listTodos, addTodo, setTodoDone, deleteTodo, type Todo } from '../lib/todos'
import { listEventsInRange, addEvent, deleteEvent, type EventItem, type EventKind } from '../lib/events'
import { monthRangeISO } from '../lib/calendar'
import { recordXpEvent } from '../mascot/mascot'
import { TodoSection } from '../components/sections/TodoSection'
import { ScheduleSection } from '../components/sections/ScheduleSection'
import {
  myTeam, createTeam, joinTeamByCode, listTeamTasks, addTeamTask,
  setTeamTaskStatus, deleteTeamTask, type Team, type TeamTask, type TeamTaskStatus,
} from '../lib/team'
import { TeamSection } from '../components/sections/TeamSection'

/**
 * Home scroll sections below the hero. Sections 2 (todos + schedule) and
 * 3 (team) are live; section 4 (papers) is an anchored placeholder for later slices.
 */
export function HomeSections({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (p: Profile) => void
}) {
  const now = new Date()
  const [todos, setTodos] = useState<Todo[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [year, setYear] = useState(now.getFullYear())
  const [month0, setMonth0] = useState(now.getMonth())
  const userId = profile.id

  useEffect(() => {
    let active = true
    listTodos(supabase, userId)
      .then((t) => { if (active) setTodos(t) })
      .catch(console.error)
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    let active = true
    const { start, end } = monthRangeISO(year, month0)
    listEventsInRange(supabase, userId, start, end)
      .then((e) => { if (active) setEvents(e) })
      .catch(console.error)
    return () => { active = false }
  }, [userId, year, month0])

  const [team, setTeam] = useState<Team | null>(null)
  const [teamTasks, setTeamTasks] = useState<TeamTask[]>([])

  useEffect(() => {
    let active = true
    myTeam(supabase, userId)
      .then((t) => { if (active) setTeam(t) })
      .catch(console.error)
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!team) { setTeamTasks([]); return }
    let active = true
    listTeamTasks(supabase, team.id)
      .then((t) => { if (active) setTeamTasks(t) })
      .catch(console.error)
    return () => { active = false }
  }, [team])

  const handleAddTodo = async (title: string) => {
    try {
      const t = await addTodo(supabase, userId, title, null)
      setTodos((s) => [t, ...s])
    } catch (e) { console.error(e) }
  }

  const handleToggleTodo = async (todo: Todo) => {
    try {
      const nowDone = !todo.done
      // First-ever completion grants schedule_done XP once (xp_granted latch).
      const grantXp = nowDone && !todo.xp_granted
      const updated = await setTodoDone(supabase, todo.id, nowDone, todo.xp_granted || grantXp)
      setTodos((s) => s.map((t) => (t.id === todo.id ? updated : t)))
      if (grantXp) {
        const p = await recordXpEvent(supabase, profile, 'schedule_done')
        onProfileChange(p)
      }
    } catch (e) { console.error(e) }
  }

  const handleDeleteTodo = async (id: string) => {
    try {
      await deleteTodo(supabase, id)
      setTodos((s) => s.filter((t) => t.id !== id))
    } catch (e) { console.error(e) }
  }

  const handleAddEvent = async (v: { title: string; starts_at: string; kind: EventKind }) => {
    try {
      const e = await addEvent(supabase, userId, v)
      const { start, end } = monthRangeISO(year, month0)
      if (e.starts_at >= start && e.starts_at.slice(0, 10) < end) {
        setEvents((s) => [...s, e].sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
      }
    } catch (e) { console.error(e) }
  }

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteEvent(supabase, id)
      setEvents((s) => s.filter((e) => e.id !== id))
    } catch (e) { console.error(e) }
  }

  const handleMonthChange = (y: number, m0: number) => { setYear(y); setMonth0(m0) }

  const handleCreateTeam = async (name: string) => {
    try { setTeam(await createTeam(supabase, userId, name, profile.nickname)) }
    catch (e) { console.error(e) }
  }
  const handleJoinTeam = async (code: string) => {
    try {
      await joinTeamByCode(supabase, code, profile.nickname)
      setTeam(await myTeam(supabase, userId))
    } catch (e) { console.error(e) }
  }
  const handleAddTeamTask = async (title: string) => {
    if (!team) return
    try { const t = await addTeamTask(supabase, team.id, userId, title, profile.nickname); setTeamTasks((s) => [...s, t]) }
    catch (e) { console.error(e) }
  }
  const handleMoveTeamTask = async (task: TeamTask, status: TeamTaskStatus) => {
    try {
      const updated = await setTeamTaskStatus(supabase, task.id, status)
      setTeamTasks((s) => s.map((t) => (t.id === task.id ? updated : t)))
    } catch (e) { console.error(e) }
  }
  const handleDeleteTeamTask = async (id: string) => {
    try { await deleteTeamTask(supabase, id); setTeamTasks((s) => s.filter((t) => t.id !== id)) }
    catch (e) { console.error(e) }
  }

  return (
    <div className="mx-auto flex max-w-[1831px] flex-col gap-16 px-6 py-16 sm:px-10">
      {/* Section 2: todos + schedule */}
      <section id="schedule" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          오늘의 <span className="font-condiment normal-case text-neon">plan</span>
        </h2>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
          <TodoSection todos={todos} onAdd={handleAddTodo} onToggle={handleToggleTodo} onDelete={handleDeleteTodo} />
          <ScheduleSection events={events} year={year} month0={month0}
            onMonthChange={handleMonthChange} onAdd={handleAddEvent} onDelete={handleDeleteEvent} />
        </div>
      </section>

      {/* Section 3: team missions + conference calendar */}
      <section id="team" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          팀 <span className="font-condiment normal-case text-neon">missions</span>
        </h2>
        <TeamSection
          team={team}
          tasks={teamTasks}
          conferences={events.filter((e) => e.kind === 'conference')}
          onCreate={handleCreateTeam}
          onJoin={handleJoinTeam}
          onAddTask={handleAddTeamTask}
          onMove={handleMoveTeamTask}
          onDeleteTask={handleDeleteTeamTask}
        />
      </section>

      {/* Section 4 placeholder: papers */}
      <section id="papers" className="scroll-mt-8">
        <h2 className="mb-4 font-grotesk text-3xl uppercase sm:text-5xl">
          논문 <span className="font-condiment normal-case text-neon">breakdown</span>
        </h2>
        <p className="font-mono text-sm uppercase text-cream/40">곧 제공 — 전공 최신 논문 수집과 AI 분석 리포트가 여기에 들어옵니다.</p>
      </section>
    </div>
  )
}
