import { useState, type FormEvent } from 'react'
import { LiquidGlass } from '../LiquidGlass'
import {
  TEAM_TASK_STATUS_LABEL, teamProgress,
  TEAM_ROLE_LABEL,
  type Team, type TeamAuditEvent, type TeamMember, type TeamRole,
  type TeamTask, type TeamTaskStatus,
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
  loading = false,
  busyAction = null,
  pendingTaskIds = new Set<string>(),
  currentUserId,
  members = [],
  auditEvents = [],
  onChangeMemberRole,
  onRemoveMember,
  onLeave,
  onTransferOwnership,
}: {
  team: Team | null
  tasks: TeamTask[]
  conferences: EventItem[]
  onCreate: (name: string) => boolean | void | Promise<boolean | void>
  onJoin: (code: string) => boolean | void | Promise<boolean | void>
  onAddTask: (title: string) => boolean | void | Promise<boolean | void>
  onMove: (task: TeamTask, status: TeamTaskStatus) => void
  onDeleteTask: (id: string) => void
  loading?: boolean
  busyAction?: string | null
  pendingTaskIds?: Set<string>
  currentUserId?: string
  members?: TeamMember[]
  auditEvents?: TeamAuditEvent[]
  onChangeMemberRole?: (member: TeamMember, role: Exclude<TeamRole, 'owner'>) => void
  onRemoveMember?: (member: TeamMember) => void
  onLeave?: () => void
  onTransferOwnership?: (member: TeamMember) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')

  if (loading) {
    return (
      <div aria-label="팀 정보 불러오는 중" className="grid animate-pulse gap-6 lg:grid-cols-2">
        <div className="h-40 rounded-[24px] bg-white/10" />
        <div className="h-40 rounded-[24px] bg-white/10" />
      </div>
    )
  }

  if (!team) {
    const create = async (e: FormEvent) => {
      e.preventDefault()
      if (!name.trim() || busyAction) return
      const saved = await onCreate(name.trim())
      if (saved !== false) setName('')
    }
    const join = async (e: FormEvent) => {
      e.preventDefault()
      if (!code.trim() || busyAction) return
      const saved = await onJoin(code.trim())
      if (saved !== false) setCode('')
    }
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <LiquidGlass className="rounded-[24px]">
          <form onSubmit={create} className="flex flex-col gap-3 p-6">
            <h3 className="font-grotesk text-xl uppercase">팀 만들기</h3>
            <p className="font-mono text-xs text-cream/60">의국/팀을 만들고 초대 코드를 공유하세요.</p>
            <input aria-label="팀 이름" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="예: 내과 의국"
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
            <button type="submit" disabled={busyAction !== null}
              className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
              {busyAction === 'create' ? '생성 중…' : '팀 만들기'}
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
            <button type="submit" disabled={busyAction !== null}
              className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
              {busyAction === 'join' ? '참여 중…' : '참여하기'}
            </button>
          </form>
        </LiquidGlass>
      </div>
    )
  }

  const progress = teamProgress(tasks)
  const currentRole =
    team.current_role ??
    members.find((member) => member.user_id === currentUserId)?.role ??
    'member'
  const canManageMembers = currentRole === 'owner' || currentRole === 'admin'
  const byStatus = (s: TeamTaskStatus) => tasks.filter((t) => t.status === s)
  const addTask = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || busyAction) return
    const saved = await onAddTask(title.trim())
    if (saved === false) return
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

      {members.length > 0 && (
        <LiquidGlass className="rounded-[24px]">
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-mono text-xs uppercase text-cream/60">팀 멤버 · {members.length}명</h4>
              {currentRole !== 'owner' ? (
                <button type="button" onClick={onLeave} disabled={busyAction === 'leave'}
                  className="font-mono text-[10px] text-amber-300/80 underline disabled:opacity-40">
                  {busyAction === 'leave' ? '처리 중…' : '팀 나가기'}
                </button>
              ) : (
                <span className="font-mono text-[10px] text-cream/40">나가려면 먼저 소유권 이전</span>
              )}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {members.map((member) => {
                const isSelf = member.user_id === currentUserId
                const isOwner = member.role === 'owner'
                const busy = busyAction?.endsWith(member.user_id) ?? false
                const adminCanRemove =
                  currentRole === 'owner' ||
                  (currentRole === 'admin' && !['owner', 'admin'].includes(member.role))
                return (
                  <li key={member.user_id}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                    <span className="flex-1 font-mono text-xs">
                      {member.nickname || '이름 없음'} {isSelf && <span className="text-neon">(나)</span>}
                    </span>
                    {currentRole === 'owner' && !isOwner ? (
                      <select
                        aria-label={`${member.nickname || '멤버'} 역할`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) => onChangeMemberRole?.(
                          member,
                          event.target.value as Exclude<TeamRole, 'owner'>,
                        )}
                        className="rounded bg-white/10 px-2 py-1 font-mono text-[10px] text-cream [&>option]:bg-bg"
                      >
                        <option value="admin">관리자</option>
                        <option value="professor">교수</option>
                        <option value="member">멤버</option>
                      </select>
                    ) : (
                      <span className="rounded bg-white/10 px-2 py-1 font-mono text-[10px] text-cream/70">
                        {TEAM_ROLE_LABEL[member.role]}
                      </span>
                    )}
                    {currentRole === 'owner' && !isOwner && (
                      <button type="button" onClick={() => onTransferOwnership?.(member)}
                        disabled={busy}
                        className="font-mono text-[10px] text-sky-300 underline disabled:opacity-40">
                        소유권 이전
                      </button>
                    )}
                    {!isSelf && !isOwner && canManageMembers && adminCanRemove && (
                      <button type="button" onClick={() => onRemoveMember?.(member)}
                        disabled={busy}
                        className="font-mono text-[10px] text-red-300 underline disabled:opacity-40">
                        내보내기
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </LiquidGlass>
      )}

      <form onSubmit={addTask} className="flex gap-2">
        <input aria-label="팀 할일 추가" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 저널 발제 준비"
          className="flex-1 rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon" />
        <button type="submit" disabled={busyAction !== null}
          className="rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
          {busyAction === 'add-task' ? '추가 중…' : '추가'}
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
                            disabled={pendingTaskIds.has(t.id)}
                            className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/70 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-30">←</button>
                        )}
                        {s !== 'done' && (
                          <button aria-label="다음 상태" onClick={() => onMove(t, ORDER[ORDER.indexOf(s) + 1])}
                            disabled={pendingTaskIds.has(t.id)}
                            className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/70 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-30">→</button>
                        )}
                        {(!currentUserId || t.created_by === currentUserId || canManageMembers) && (
                          <button aria-label="팀 할일 삭제" onClick={() => onDeleteTask(t.id)}
                            disabled={pendingTaskIds.has(t.id)}
                            className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-cream/40 transition hover:text-red-400 disabled:cursor-wait disabled:opacity-30">✕</button>
                        )}
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

      {auditEvents.length > 0 && (
        <details className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
          <summary className="cursor-pointer font-mono text-xs uppercase text-cream/60">
            최근 팀 변경 기록
          </summary>
          <ul className="mt-3 flex flex-col gap-1">
            {auditEvents.slice(0, 10).map((event) => (
              <li key={event.id} className="font-mono text-[10px] text-cream/50">
                {new Date(event.created_at).toLocaleString('ko-KR')} · {event.action}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
