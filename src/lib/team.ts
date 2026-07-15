import type { SupabaseClient } from '@supabase/supabase-js'

export interface Team {
  id: string
  name: string
  code: string
  created_by: string
}

export interface TeamMember {
  team_id: string
  user_id: string
  role: string
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
  due_date: string | null
  created_by: string
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export function generateTeamCode(rand: () => number = Math.random): string {
  let c = ''
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]
  return c
}

/** The user's first team (v1: one team per user), with the team row joined in. */
export async function myTeam(client: SupabaseClient, userId: string): Promise<Team | null> {
  const { data, error } = await client
    .from('team_members')
    .select('team_id, teams(*)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const teams = (data as any)?.teams
  return (Array.isArray(teams) ? teams[0] : teams) ?? null
}

export async function createTeam(
  client: SupabaseClient,
  userId: string,
  name: string,
  nickname: string | null,
  rand: () => number = Math.random,
): Promise<Team> {
  const { data, error } = await client
    .from('teams')
    .insert({ name, code: generateTeamCode(rand), created_by: userId })
    .select()
    .single()
  if (error) throw error
  const team = data as Team
  const { error: mErr } = await client
    .from('team_members')
    .insert({ team_id: team.id, user_id: userId, nickname })
    .select()
    .single()
  if (mErr) throw mErr
  return team
}

/** Join via invite code through the security-definer RPC; returns the team id. */
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
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as TeamTask[]) ?? []
}

export async function addTeamTask(
  client: SupabaseClient,
  teamId: string,
  userId: string,
  title: string,
  assignee: string | null,
): Promise<TeamTask> {
  const { data, error } = await client
    .from('team_tasks')
    .insert({ team_id: teamId, created_by: userId, title, assignee })
    .select()
    .single()
  if (error) throw error
  return data as TeamTask
}

export async function setTeamTaskStatus(
  client: SupabaseClient,
  id: string,
  status: TeamTaskStatus,
): Promise<TeamTask> {
  const { data, error } = await client
    .from('team_tasks')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as TeamTask
}

export async function deleteTeamTask(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('team_tasks').delete().eq('id', id)
  if (error) throw error
}

/** Percent of tasks done (0–100, rounded). */
export function teamProgress(tasks: TeamTask[]): number {
  if (tasks.length === 0) return 0
  return Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100)
}
