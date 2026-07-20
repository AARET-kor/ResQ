import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { Profile } from '../lib/profile'
import { listTodos, addTodo, setTodoDone, deleteTodo, type Todo, type TodoPriority } from '../lib/todos'
import { requestTodoExtraction, type ExtractedTodo } from '../lib/todoExtract'
import { listEventsInRange, addEvent, deleteEvent, type EventItem, type EventKind } from '../lib/events'
import { monthRangeISO } from '../lib/calendar'
import { buildICS } from '../lib/ics'
import { insertGoogleEvent, markEventSynced, GOOGLE_AUTH_ERROR } from '../lib/gcal'
import { listRecentEmailTexts, requestEventExtraction, type ExtractedEvent } from '../lib/gmail'
import { recordXpEvent } from '../mascot/mascot'
import { TodoSection } from '../components/sections/TodoSection'
import { ScheduleSection } from '../components/sections/ScheduleSection'
import { SyncPanel } from '../components/sections/SyncPanel'
import {
  myTeam, createTeam, joinTeamByCode, listTeamTasks, addTeamTask,
  setTeamTaskStatus, deleteTeamTask, type Team, type TeamTask, type TeamTaskStatus,
} from '../lib/team'
import { TeamSection } from '../components/sections/TeamSection'
import { fetchPmcFullText, type Paper } from '../lib/pubmed'
import { getAnalysis, requestAnalysis, requestReport, saveAnalysis, listMyReports, type PaperAnalysis } from '../lib/papers'
import { journalsFor } from '../lib/sources'
import { searchEuropePmc, fetchEpmcFullText } from '../lib/europepmc'
import { sortPapers, type PaperSortKey, type SortDir } from '../lib/sortPapers'
import { parseInterests, upsertProfile } from '../lib/profile'
import { SPECIALTIES, SPECIALTY_ABBR } from '../mascot/roster'
import { PapersSection } from '../components/sections/PapersSection'

/**
 * Home scroll sections below the hero. Section 2 (todos + schedule),
 * section 3 (team), and section 4 (papers) are live.
 */
export function HomeSections({
  profile,
  onProfileChange,
}: {
  profile: Profile
  onProfileChange: (p: Profile) => void
}) {
  const now = new Date()
  const { providerToken } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [year, setYear] = useState(now.getFullYear())
  const [month0, setMonth0] = useState(now.getMonth())
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedEvent[]>([])
  const [todoExtracting, setTodoExtracting] = useState(false)
  const [extractedTodos, setExtractedTodos] = useState<ExtractedTodo[]>([])
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

  const handleAddTodo = async (
    title: string,
    opts: { priority: TodoPriority; dueDate: string | null; dueTime: string | null },
  ) => {
    try {
      const t = await addTodo(supabase, userId, title, opts.dueDate, {
        priority: opts.priority,
        dueTime: opts.dueTime,
      })
      setTodos((s) => [t, ...s])
    } catch (e) { console.error(e) }
  }

  const handleExtractTodos = async (input: { text?: string; imageBase64?: string; mediaType?: string }) => {
    setTodoExtracting(true)
    try {
      const found = await requestTodoExtraction(supabase, input, profile.specialty)
      setExtractedTodos(found)
    } catch (e) {
      console.error(e)
    } finally {
      setTodoExtracting(false)
    }
  }

  const handleAddExtractedTodo = async (t: ExtractedTodo) => {
    try {
      const added = await addTodo(supabase, userId, t.title, t.due_date, {
        priority: t.priority,
        dueTime: t.due_time,
      })
      setTodos((s) => [added, ...s])
      setExtractedTodos((s) => s.filter((x) => x !== t))
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
      const day = e.starts_at.slice(0, 10)
      if (day >= start && day < end) {
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

  const handleSyncMonth = async () => {
    if (!providerToken || syncing) return
    setSyncing(true)
    setSyncMessage('동기화 중…')
    let ok = 0, failed = 0
    try {
      for (const e of events.filter((e) => !e.gcal_id)) {
        try {
          const gid = await insertGoogleEvent(providerToken, e)
          await markEventSynced(supabase, e.id, gid)
          // immutable update so React state never carries mutated objects
          setEvents((s) => s.map((x) => (x.id === e.id ? { ...x, gcal_id: gid } : x)))
          ok++
        } catch (err) {
          failed++
          if (err instanceof Error && err.message === GOOGLE_AUTH_ERROR) { setSyncMessage(GOOGLE_AUTH_ERROR); return }
        }
      }
      setSyncMessage(failed ? `${ok}건 동기화, ${failed}건 실패` : ok ? `${ok}건 동기화 완료` : '이번 달에 새로 보낼 일정이 없습니다')
    } finally {
      setSyncing(false)
    }
  }

  const handleDownloadIcs = () => {
    const ics = buildICS(events, todos)
    const a = document.createElement('a')
    a.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
    a.download = 'resq.ics'
    a.click()
  }

  const feedUrl = profile.ics_token
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${profile.ics_token}`
    : null

  const handleScanGmail = async () => {
    if (!providerToken) return
    setScanning(true)
    setSyncMessage(null)
    try {
      const emails = await listRecentEmailTexts(providerToken)
      if (emails.length === 0) { setSyncMessage('최근 2주 메일에서 일정 후보를 찾지 못했습니다'); return }
      const found = await requestEventExtraction(supabase, emails, profile.specialty)
      setExtracted(found)
      if (found.length === 0) setSyncMessage('메일에서 일정을 찾지 못했습니다')
    } catch (e) {
      console.error(e)
      setSyncMessage(e instanceof Error ? e.message : '메일 스캔에 실패했습니다')
    } finally {
      setScanning(false)
    }
  }

  const handleAddExtracted = async (ev: ExtractedEvent) => {
    try {
      await handleAddEvent({ title: ev.title, starts_at: ev.starts_at, kind: ev.kind })
      setExtracted((s) => s.filter((x) => x !== ev))
      setSyncMessage(`'${ev.title}' 일정을 추가했습니다`)
    } catch (e) { console.error(e) }
  }

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

  const [shelfData, setShelfData] = useState<{ label: string; papers: Paper[] }[]>([])
  const [papersLoading, setPapersLoading] = useState(false)
  const [papersError, setPapersError] = useState<string | null>(null)
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [paperDays, setPaperDays] = useState<7 | 30>(7)
  const [selectedJournals, setSelectedJournals] = useState<string[]>([])
  const [reports, setReports] = useState<PaperAnalysis[]>([])
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null)
  const [analysisKind, setAnalysisKind] = useState<'abstract' | 'report' | null>(null)
  const [sortKey, setSortKey] = useState<PaperSortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  // Local mirror of interests: shelves keep working this session even when the
  // interests upsert fails (e.g. migration 0008 not applied yet).
  const [localInterests, setLocalInterests] = useState<string[]>(() => parseInterests(profile.interests))
  const [specialtyNotice, setSpecialtyNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listMyReports(supabase, userId).then((r) => { if (active) setReports(r) }).catch(console.error)
    return () => { active = false }
  }, [userId])

  const journals = journalsFor(profile.specialty)
  const feedList = [...new Set([profile.specialty ?? '', ...localInterests].filter(Boolean))]

  const handleToggleJournal = (id: string) =>
    setSelectedJournals((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const doRefreshPapers = async (specialties: string[]) => {
    setPapersLoading(true)
    setPapersError(null)
    try {
      const tas = journals.filter((j) => j.indexed !== false && selectedJournals.includes(j.id)).map((j) => j.ta)
      const serverSort = (sortKey === 'cited' ? 'cited' : 'date') as 'date' | 'cited'
      const results = await Promise.all(
        specialties.map((s, i) =>
          searchEuropePmc(s, fetch, {
            days: paperDays,
            tas: i === 0 ? tas : [],
            pageSize: 10,
            sort: serverSort,
          }).catch(() => [] as Paper[]),
        ),
      )
      const shelvesNext = specialties.map((s, i) => ({ label: `${s} 신착`, papers: results[i] }))
      // 한국 학회지 선반: 주전공 레지스트리의 국내 학회지(색인된 것)만 모아 1년 범위로 검색.
      const krTas = journals.filter((j) => j.kr && j.indexed !== false).map((j) => j.ta)
      if (krTas.length > 0) {
        const krPapers = await searchEuropePmc(specialties[0], fetch, {
          tas: krTas,
          days: 365,
          pageSize: 10,
          sort: serverSort,
        }).catch(() => [] as Paper[])
        shelvesNext.push({ label: '한국 학회지 (대한성형외과학회 등)', papers: krPapers })
      }
      setShelfData(shelvesNext)
    } catch (e) {
      console.error(e)
      setPapersError('논문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setPapersLoading(false)
    }
  }

  const handleRefreshPapers = () => doRefreshPapers(feedList)

  // Changing sort re-queries so server-side orders (cited) apply to fresh data.
  useEffect(() => {
    if (shelfData.length > 0) doRefreshPapers(feedList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir])

  const handleToggleSpecialty = async (name: string) => {
    const next = localInterests.includes(name)
      ? localInterests.filter((x) => x !== name)
      : [...localInterests, name]
    setLocalInterests(next)
    setSpecialtyNotice(null)
    // Persist to the profile; degrade gracefully when the column doesn't exist yet.
    try {
      const saved = await upsertProfile(supabase, { id: userId, interests: next.join(',') })
      onProfileChange(saved)
    } catch (e) {
      console.error(e)
      setSpecialtyNotice('관심 전공 저장 실패 — 이번 세션에만 적용됩니다 (Supabase에 0008 마이그레이션 적용 필요)')
    }
    // Refresh shelves immediately if papers are already loaded.
    if (shelfData.length > 0) {
      const nextFeed = [...new Set([profile.specialty ?? '', ...next].filter(Boolean))]
      doRefreshPapers(nextFeed)
    }
  }

  const shelves = shelfData.map((s) => ({ label: s.label, papers: sortPapers(s.papers, sortKey, sortDir) }))

  const refreshReports = () =>
    listMyReports(supabase, userId).then(setReports).catch(console.error)

  const handleOpenPaper = async (p: Paper) => {
    setSelectedPaper(p)
    setSelectedTitle(p.title)
    setAnalysis(null); setAnalysisKind(null); setAnalysisError(null); setAnalysisLoading(true)
    try {
      const cached = await getAnalysis(supabase, userId, p.pmid)
      if (cached) { setAnalysis(cached.analysis); setAnalysisKind((cached.kind as any) ?? 'abstract'); return }
      let text: string
      let kind: 'abstract' | 'report' = 'abstract'
      let hasFulltext = false
      if (p.pmcid) {
        const body = (await fetchEpmcFullText(p.pmcid)) || (await fetchPmcFullText(p.pmcid).catch(() => ''))
        if (body) {
          text = await requestReport(supabase, p, profile.specialty, { fulltext: body })
          kind = 'report'; hasFulltext = true
        } else {
          if (!p.abstract) { setAnalysisError('초록이 없는 논문은 분석할 수 없습니다.'); return }
          text = await requestAnalysis(supabase, p, profile.specialty)
        }
      } else {
        if (!p.abstract) { setAnalysisError('초록이 없는 논문은 분석할 수 없습니다. 원문 링크를 확인해주세요.'); return }
        text = await requestAnalysis(supabase, p, profile.specialty)
      }
      await saveAnalysis(supabase, userId, p, text, { kind, hasFulltext, source: p.journal || null })
      setAnalysis(text); setAnalysisKind(kind)
      // First successful analysis of this paper → read_paper XP (+20).
      const updated = await recordXpEvent(supabase, profile, 'read_paper')
      onProfileChange(updated)
      refreshReports()
    } catch (e) {
      console.error(e)
      setAnalysisError(e instanceof Error ? e.message : '분석에 실패했습니다.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const handleUploadPdf = async (file: File) => {
    const surrogate: Paper = {
      pmid: `pdf-${Date.now()}`, title: file.name.replace(/\.pdf$/i, ''), journal: 'PDF 업로드',
      year: '', abstract: '', url: '', pmcid: null,
    }
    setSelectedPaper(surrogate)
    setSelectedTitle(surrogate.title)
    setAnalysis(null); setAnalysisKind(null); setAnalysisError(null); setAnalysisLoading(true)
    try {
      const buf = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const pdfBase64 = btoa(binary)
      const text = await requestReport(supabase, surrogate, profile.specialty, { pdfBase64 })
      await saveAnalysis(supabase, userId, surrogate, text, { kind: 'report', hasFulltext: true, source: 'pdf' })
      setAnalysis(text); setAnalysisKind('report')
      const updated = await recordXpEvent(supabase, profile, 'read_paper')
      onProfileChange(updated)
      refreshReports()
    } catch (e) {
      console.error(e)
      setAnalysisError(e instanceof Error ? e.message : 'PDF 분석에 실패했습니다.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const handleOpenReport = (r: PaperAnalysis) => {
    setSelectedPaper({ pmid: r.pmid, title: r.title, journal: r.journal ?? '', year: r.year ?? '', abstract: r.abstract ?? '', url: r.pmid.startsWith('pdf-') ? '' : `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, pmcid: null })
    setSelectedTitle(r.title)
    setAnalysis(r.analysis)
    setAnalysisKind(((r as any).kind as any) ?? 'abstract')
    setAnalysisError(null)
  }

  const handleClosePaper = () => {
    setSelectedPaper(null); setAnalysis(null); setAnalysisError(null)
    setSelectedTitle(null); setAnalysisKind(null)
  }

  return (
    <div className="mx-auto flex max-w-[1831px] flex-col gap-16 px-6 py-16 sm:px-10">
      {/* Section 2: todos + schedule */}
      <section id="schedule" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          오늘의 <span className="font-condiment normal-case text-neon">plan</span>
        </h2>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
          <TodoSection
            todos={todos}
            onAdd={handleAddTodo}
            onToggle={handleToggleTodo}
            onDelete={handleDeleteTodo}
            onExtract={handleExtractTodos}
            extracting={todoExtracting}
            extracted={extractedTodos}
            onAddExtracted={handleAddExtractedTodo}
            onDismissExtracted={() => setExtractedTodos([])}
          />
          <ScheduleSection events={events} year={year} month0={month0}
            onMonthChange={handleMonthChange} onAdd={handleAddEvent} onDelete={handleDeleteEvent} />
        </div>
        <div className="mt-6">
          <SyncPanel
            googleConnected={!!providerToken}
            onSyncMonth={handleSyncMonth}
            syncing={syncing}
            syncMessage={syncMessage}
            onDownloadIcs={handleDownloadIcs}
            feedUrl={feedUrl}
            onScanGmail={handleScanGmail}
            scanning={scanning}
            extracted={extracted}
            onAddExtracted={handleAddExtracted}
            onDismissExtracted={() => setExtracted([])}
          />
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

      {/* Section 4: papers */}
      <section id="papers" className="scroll-mt-8">
        <h2 className="mb-6 font-grotesk text-3xl uppercase sm:text-5xl">
          논문 <span className="font-condiment normal-case text-neon">breakdown</span>
        </h2>
        <PapersSection
          shelves={shelves}
          loading={papersLoading}
          error={papersError}
          journals={journals}
          selectedJournals={selectedJournals}
          onToggleJournal={handleToggleJournal}
          days={paperDays}
          onDaysChange={setPaperDays}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortKeyChange={setSortKey}
          onSortDirChange={setSortDir}
          onRefresh={handleRefreshPapers}
          onOpen={handleOpenPaper}
          onUploadPdf={handleUploadPdf}
          reports={reports}
          onOpenReport={handleOpenReport}
          selected={selectedPaper}
          selectedTitle={selectedTitle}
          analysis={analysis}
          analysisKind={analysisKind}
          analysisLoading={analysisLoading}
          analysisError={analysisError}
          onClose={handleClosePaper}
          specialtyOptions={SPECIALTIES.map((s) => ({ name: s, abbr: SPECIALTY_ABBR[s] ?? '' }))}
          feed={feedList}
          primary={profile.specialty}
          onToggleSpecialty={handleToggleSpecialty}
          specialtyNotice={specialtyNotice}
        />
      </section>
    </div>
  )
}
