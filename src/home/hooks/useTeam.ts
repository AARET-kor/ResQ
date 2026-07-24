import { useEffect, useRef, useState } from 'react'
import {
  addTeamTask,
  createTeam,
  deleteTeamTask,
  joinTeamByCode,
  leaveTeam,
  listMembers,
  listTeamAudit,
  listTeamTasks,
  myTeam,
  removeTeamMember,
  setTeamMemberRole,
  setTeamTaskStatus,
  transferTeamOwnership,
  type Team,
  type TeamAuditEvent,
  type TeamMember,
  type TeamRole,
  type TeamTask,
  type TeamTaskStatus,
} from '../../lib/team'
import type { Profile } from '../../lib/profile'
import { supabase } from '../../lib/supabase'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'

export function useTeam(profile: Profile) {
  const { notify } = useNotifications()
  const [team, setTeam] = useState<Team | null>(null)
  const [tasks, setTasks] = useState<TeamTask[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [auditEvents, setAuditEvents] = useState<TeamAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set())
  const [reloadToken, setReloadToken] = useState(0)
  const busyRef = useRef(false)
  const pendingTaskIdsRef = useRef(new Set<string>())
  const userId = profile.id

  useEffect(() => {
    let active = true
    setLoading(true)
    myTeam(supabase, userId)
      .then((result) => { if (active) setTeam(result) })
      .catch((error) => {
        console.error(error)
        if (active) notify({
          message: requestErrorMessage(error, '팀 정보를 불러오지 못했습니다.'),
          tone: 'error',
          action: { label: '재시도', onClick: () => setReloadToken((value) => value + 1) },
        })
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [notify, reloadToken, userId])

  useEffect(() => {
    if (!team) {
      setTasks([])
      setMembers([])
      setAuditEvents([])
      return
    }
    let active = true
    Promise.all([
      listTeamTasks(supabase, team.id),
      listMembers(supabase, team.id),
      listTeamAudit(supabase, team.id),
    ])
      .then(([taskItems, memberItems, auditItems]) => {
        if (!active) return
        setTasks(taskItems)
        setMembers(memberItems)
        setAuditEvents(auditItems)
      })
      .catch((error) => {
        console.error(error)
        if (active) notify({
          message: requestErrorMessage(error, '팀 할 일을 불러오지 못했습니다.'),
          tone: 'error',
          action: { label: '재시도', onClick: () => setReloadToken((value) => value + 1) },
        })
      })
    return () => { active = false }
  }, [notify, team])

  const create = async (name: string) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusyAction('create')
    try {
      setTeam(await createTeam(supabase, name, profile.nickname))
      return true
    } catch (error) {
      console.error(error)
      notify({ message: requestErrorMessage(error, '팀을 만들지 못했습니다.'), tone: 'error' })
      return false
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  const join = async (code: string) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusyAction('join')
    try {
      await joinTeamByCode(supabase, code, profile.nickname)
      setTeam(await myTeam(supabase, userId))
      return true
    } catch (error) {
      console.error(error)
      notify({ message: requestErrorMessage(error, '팀에 참여하지 못했습니다. 초대 코드를 확인해주세요.'), tone: 'error' })
      return false
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  const addTask = async (title: string) => {
    if (!team || busyRef.current) return false
    busyRef.current = true
    setBusyAction('add-task')
    try {
      const task = await addTeamTask(
        supabase,
        team.id,
        title,
        userId,
      )
      setTasks((current) => [...current, task])
      void listTeamAudit(supabase, team.id).then(setAuditEvents)
      return true
    } catch (error) {
      console.error(error)
      notify({ message: requestErrorMessage(error, '팀 할 일을 추가하지 못했습니다.'), tone: 'error' })
      return false
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  const moveTask = async (task: TeamTask, status: TeamTaskStatus) => {
    if (pendingTaskIdsRef.current.has(task.id)) return
    pendingTaskIdsRef.current.add(task.id)
    setPendingTaskIds(new Set(pendingTaskIdsRef.current))
    setTasks((current) => current.map((item) => (
      item.id === task.id ? { ...item, status } : item
    )))
    try {
      const updated = await setTeamTaskStatus(supabase, task.id, status)
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)))
      if (team) void listTeamAudit(supabase, team.id).then(setAuditEvents)
    } catch (error) {
      console.error(error)
      setTasks((current) => current.map((item) => (item.id === task.id ? task : item)))
      notify({
        message: requestErrorMessage(error, '팀 할 일 상태를 바꾸지 못해 이전 상태로 되돌렸습니다.'),
        tone: 'error',
        action: { label: '재시도', onClick: () => { void moveTask(task, status) } },
      })
    } finally {
      pendingTaskIdsRef.current.delete(task.id)
      setPendingTaskIds(new Set(pendingTaskIdsRef.current))
    }
  }

  const removeTask = async (id: string) => {
    if (pendingTaskIdsRef.current.has(id)) return
    const removed = tasks.find((task) => task.id === id)
    const removedIndex = tasks.findIndex((task) => task.id === id)
    pendingTaskIdsRef.current.add(id)
    setPendingTaskIds(new Set(pendingTaskIdsRef.current))
    setTasks((current) => current.filter((task) => task.id !== id))
    try {
      await deleteTeamTask(supabase, id)
      if (team) void listTeamAudit(supabase, team.id).then(setAuditEvents)
    } catch (error) {
      console.error(error)
      if (removed) {
        setTasks((current) => {
          if (current.some((task) => task.id === id)) return current
          const next = [...current]
          next.splice(Math.max(0, removedIndex), 0, removed)
          return next
        })
      }
      notify({
        message: requestErrorMessage(error, '팀 할 일을 삭제하지 못해 목록에 복원했습니다.'),
        tone: 'error',
        action: { label: '재시도', onClick: () => { void removeTask(id) } },
      })
    } finally {
      pendingTaskIdsRef.current.delete(id)
      setPendingTaskIds(new Set(pendingTaskIdsRef.current))
    }
  }

  const changeMemberRole = async (
    member: TeamMember,
    role: Exclude<TeamRole, 'owner'>,
  ) => {
    if (!team || busyRef.current) return
    busyRef.current = true
    setBusyAction(`role:${member.user_id}`)
    try {
      await setTeamMemberRole(supabase, team.id, member.user_id, role)
      setMembers((current) => current.map((item) => (
        item.user_id === member.user_id ? { ...item, role } : item
      )))
      setAuditEvents(await listTeamAudit(supabase, team.id))
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '팀 멤버 역할을 변경하지 못했습니다.'),
        tone: 'error',
      })
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  const removeMember = async (member: TeamMember) => {
    if (!team || busyRef.current) return
    busyRef.current = true
    setBusyAction(`remove:${member.user_id}`)
    try {
      await removeTeamMember(supabase, team.id, member.user_id)
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id))
      setAuditEvents(await listTeamAudit(supabase, team.id))
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '팀 멤버를 내보내지 못했습니다.'),
        tone: 'error',
      })
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  const leave = async () => {
    if (!team || busyRef.current) return
    busyRef.current = true
    setBusyAction('leave')
    try {
      await leaveTeam(supabase, team.id)
      setTeam(null)
      setTasks([])
      setMembers([])
      setAuditEvents([])
      notify({ message: '팀에서 나왔습니다.', tone: 'success' })
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '팀에서 나가지 못했습니다. 소유자는 먼저 소유권을 이전해야 합니다.'),
        tone: 'error',
      })
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  const transferOwnership = async (member: TeamMember) => {
    if (!team || busyRef.current) return
    busyRef.current = true
    setBusyAction(`transfer:${member.user_id}`)
    try {
      await transferTeamOwnership(supabase, team.id, member.user_id)
      setMembers((current) => current.map((item) => {
        if (item.user_id === userId) return { ...item, role: 'admin' }
        if (item.user_id === member.user_id) return { ...item, role: 'owner' }
        return item
      }))
      setTeam({ ...team, current_role: 'admin' })
      setAuditEvents(await listTeamAudit(supabase, team.id))
      notify({ message: '팀 소유권을 이전했습니다.', tone: 'success' })
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '팀 소유권을 이전하지 못했습니다.'),
        tone: 'error',
      })
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  return {
    team,
    tasks,
    members,
    auditEvents,
    loading,
    busyAction,
    pendingTaskIds,
    create,
    join,
    addTask,
    moveTask,
    removeTask,
    changeMemberRole,
    removeMember,
    leave,
    transferOwnership,
  }
}
