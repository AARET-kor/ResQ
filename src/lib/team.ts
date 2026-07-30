import type { SupabaseClient } from '@supabase/supabase-js'

export type TeamRole = 'owner' | 'admin' | 'professor' | 'member'

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: '소유자',
  admin: '관리자',
  professor: '교수',
  member: '멤버',
}

export interface Team {
  id: string
  name: string
  code: string
  created_by: string
  current_role?: TeamRole
}

export interface TeamMember {
  team_id: string
  user_id: string
  role: TeamRole
  nickname: string | null
}

export type TeamTaskStatus = 'todo' | 'doing' | 'done'

export const TEAM_TASK_STATUS_LABEL: Record<TeamTaskStatus, string> = {
  todo: '할일',
  doing: '진행중',
  done: '완료',
}

export interface TeamTask {
  id: string
  team_id: string
  title: string
  status: TeamTaskStatus
  assignee: string | null
  assignee_user_id?: string | null
  due_date: string | null
  created_by: string
  deleted_at?: string | null
}

export interface TeamAuditEvent {
  id: number
  team_id: string
  actor_user_id: string | null
  action: string
  task_id: string | null
  target_user_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

function rpcRow<T>(data: unknown): T {
  return (Array.isArray(data) ? data[0] : data) as T
}

/** The user's first team (v1 navigation), including their canonical role. */
export async function myTeam(client: SupabaseClient, userId: string): Promise<Team | null> {
  const { data, error } = await client
    .from('team_members')
    .select('team_id, role, teams(*)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as { role: TeamRole; teams: Team | Team[] | null }
  const joined = Array.isArray(row.teams) ? row.teams[0] : row.teams
  return joined ? { ...joined, current_role: row.role } : null
}

/** Atomic server-side team creation with invite-code collision retries. */
export async function createTeam(
  client: SupabaseClient,
  name: string,
  nickname: string | null,
): Promise<Team> {
  const { data, error } = await client.rpc('create_team_atomic', {
    team_name: name,
    creator_nickname: nickname,
  })
  if (error) throw error
  return { ...rpcRow<Team>(data), current_role: 'owner' }
}

export async function joinTeamByCode(
  client: SupabaseClient,
  code: string,
  nickname: string | null,
): Promise<string> {
  const { data, error } = await client.rpc('join_team_by_code', {
    invite_code: code.trim().toUpperCase(),
    member_nickname: nickname,
  })
  if (error) throw error
  return data as string
}

export async function listMembers(client: SupabaseClient, teamId: string): Promise<TeamMember[]> {
  const { data, error } = await client
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return (data as TeamMember[]) ?? []
}

export async function listTeamTasks(client: SupabaseClient, teamId: string): Promise<TeamTask[]> {
  const { data, error } = await client
    .from('team_tasks')
    .select('*')
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as TeamTask[]) ?? []
}

export async function listTeamAudit(
  client: SupabaseClient,
  teamId: string,
): Promise<TeamAuditEvent[]> {
  const { data, error } = await client
    .from('team_audit_events')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data as TeamAuditEvent[]) ?? []
}

export async function addTeamTask(
  client: SupabaseClient,
  teamId: string,
  title: string,
  assigneeUserId: string | null,
): Promise<TeamTask> {
  const { data, error } = await client.rpc('add_team_task', {
    p_team_id: teamId,
    p_title: title,
    p_assignee_user_id: assigneeUserId,
  })
  if (error) throw error
  return rpcRow<TeamTask>(data)
}

export async function setTeamTaskStatus(
  client: SupabaseClient,
  id: string,
  status: TeamTaskStatus,
): Promise<TeamTask> {
  const { data, error } = await client.rpc('set_team_task_status', {
    p_task_id: id,
    p_status: status,
  })
  if (error) throw error
  return rpcRow<TeamTask>(data)
}

export async function deleteTeamTask(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.rpc('soft_delete_team_task', { p_task_id: id })
  if (error) throw error
}

export async function setTeamMemberRole(
  client: SupabaseClient,
  teamId: string,
  userId: string,
  role: Exclude<TeamRole, 'owner'>,
): Promise<void> {
  const { error } = await client.rpc('set_team_member_role', {
    p_team_id: teamId,
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw error
}

export async function removeTeamMember(
  client: SupabaseClient,
  teamId: string,
  userId: string,
): Promise<void> {
  const { error } = await client.rpc('remove_team_member', {
    p_team_id: teamId,
    p_user_id: userId,
  })
  if (error) throw error
}

export async function leaveTeam(client: SupabaseClient, teamId: string): Promise<void> {
  const { error } = await client.rpc('leave_team', { p_team_id: teamId })
  if (error) throw error
}

export async function transferTeamOwnership(
  client: SupabaseClient,
  teamId: string,
  newOwnerId: string,
): Promise<void> {
  const { error } = await client.rpc('transfer_team_ownership', {
    p_team_id: teamId,
    p_new_owner_id: newOwnerId,
  })
  if (error) throw error
}

export function teamProgress(tasks: TeamTask[]): number {
  if (tasks.length === 0) return 0
  return Math.round((tasks.filter((task) => task.status === 'done').length / tasks.length) * 100)
}
