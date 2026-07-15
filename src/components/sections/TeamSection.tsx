import { useState, type FormEvent } from 'react'
import { LiquidGlass } from '../LiquidGlass'
import {
  TEAM_TASK_STATUS_LABEL, teamProgress,
  type Team, type TeamTask, type TeamTaskStatus,
} from '../../lib/team'
import type { EventItem } from '../../lib/events'

const ORDER: TeamTaskStatus[] = ['todo', 'doing', 'done']

export function TeamSection({
  team,
  tasks,
  conferences,
  onCreate,
  onJoin,
  onAddTask,
  onMove,
  onDeleteTask,
}: {
  team: Team | null
  tasks: TeamTask[]
  conferences: EventItem[]
  onCreate: (name: string) => void
  onJoin: (code: string) => void
  onAddTask: (title: string) => void
  onMove: (task: TeamTask, status: TeamTaskStatus) => void
  onDeleteTask: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')

  if (!team) {
    const create = (e: FormEvent) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()) }
    const join = (e: FormEvent) => { e.preventDefault(); if (code.trim()) onJoin(code.trim()) }
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <LiquidGlass className="rounded-[24px]">
          <form onSubmit={create} className="flex flex-col gap-3 p-6">
            <h3 className="font-grotesk text-xl uppercase">팀 만들기</h3>
            <p className="font-mono text-xs text-cream/60">의국/팀을 만들고 초대 코드를 공유하세요.</p>
            <input aria-label="팀 이름" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="예: 내과 의국"
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
            <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
              팀 만들기
            </button>
          </form>
        </LiquidGlass>
        <LiquidGlass className="rounded-[24px]">
          <form onSubmit={join} className="flex flex-col gap-3 p-6">
            <h3 className="font-grotesk text-xl uppercase">팀 참여</h3>
            <p className="font-mono text-xs text-cream/60">동료에게 받은 6자리 초대 코드를 입력하세요.</p>
            <input aria-label="초대 코드" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="예: ABC123"
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm uppercase text-cream outline-none focus:ring-1 focus:ring-neon" />
            <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
              참여하기
            </button>
          </form>
        </LiquidGlass>
      </div>
    )
  }

  const progress = teamProgress(tasks)
  const byStatus = (s: TeamTaskStatus) => tasks.filter((t) => t.status === s)
  const addTask = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onAddTask(title.trim())
    setTitle('')
  }

  return (
    <div className="flex flex-col gap-6">
      <LiquidGlass className="rounded-[24px]">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h3 className="font-grotesk text-2xl uppercase">{team.name}</h3>
            <p className="font-mono text-xs uppercase text-cream/60">초대 코드 <span className="text-neon">{team.code}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-neon transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="font-grotesk text-lg uppercase text-neon">{progress}%</span>
          </div>
        </div>
      </LiquidGlass>

      <form onSubmit={addTask} className="flex gap-2">
        <input aria-label="팀 할일 추가" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 저널 발제 준비"
          className="flex-1 rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
        <button type="submit" className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90">
          추가
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        {ORDER.map((s) => (
          <LiquidGlass key={s} className="rounded-[20px]">
            <div className="flex flex-col gap-2 p-4" data-testid={`col-${s}`}>
              <h4 className="font-mono text-xs uppercase text-cream/60">
                {TEAM_TASK_STATUS_LABEL[s]} <span className="text-cream/40">{byStatus(s).length}</span>
              </h4>
              <ul className="flex flex-col gap-2">
                {byStatus(s).map((t) => (
                  <li key={t.id} className="rounded-md bg-white/5 px-3 py-2">
                    <div className="font-mono text-sm">{t.title}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase text-cream/50">{t.assignee ?? ''}</span>
                      <span className="flex gap-1">
                        {s !== 'todo' && (
                          <button aria-label="이전 상태" onClick={() => onMove(t, ORDER[ORDER.indexOf(s) - 1])}
                            className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/70 transition hover:bg-white/10">←</button>
                        )}
                        {s !== 'done' && (
                          <button aria-label="다음 상태" onClick={() => onMove(t, ORDER[ORDER.indexOf(s) + 1])}
                            className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/70 transition hover:bg-white/10">→</button>
                        )}
                        <button aria-label="팀 할일 삭제" onClick={() => onDeleteTask(t.id)}
                          className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/40 transition hover:text-red-400">✕</button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </LiquidGlass>
        ))}
      </div>

      <div>
        <h4 className="mb-2 font-mono text-xs uppercase text-cream/60">이번 달 학회 일정</h4>
        <ul className="flex flex-col gap-2">
          {conferences.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-neon" />
              <span className="font-mono text-[10px] uppercase text-cream/60">{e.starts_at.slice(5, 10)}</span>
              <span className="font-mono text-sm">{e.title}</span>
            </li>
          ))}
          {conferences.length === 0 && (
            <li className="font-mono text-xs uppercase text-cream/40">이번 달 학회 일정이 없습니다</li>
          )}
        </ul>
      </div>
    </div>
  )
}
