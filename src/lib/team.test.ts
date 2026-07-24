import { describe, it, expect } from 'vitest'
import {
  myTeam, createTeam, joinTeamByCode, listMembers,
  listTeamTasks, addTeamTask, setTeamTaskStatus, deleteTeamTask,
  setTeamMemberRole, removeTeamMember, leaveTeam, transferTeamOwnership,
  teamProgress, type Team, type TeamTask,
} from './team'

const team: Team = { id: 'tm1', name: '내과 의국', code: 'ABC123', created_by: 'u1' }
const task = (id: string, status: TeamTask['status']): TeamTask =>
  ({ id, team_id: 'tm1', title: 't', status, assignee: null, assignee_user_id: 'u1', due_date: null, created_by: 'u1' })

function fakeClient(opts: { memberRows?: any[]; teamRow?: Team | null; tasks?: TeamTask[]; rpcResult?: any } = {}) {
  const calls: { op: string; args: any }[] = []
  const client = {
    calls,
    rpc: (fn: string, args: any) => {
      calls.push({ op: `rpc:${fn}`, args })
      const defaults: Record<string, unknown> = {
        create_team_atomic: team,
        join_team_by_code: 'tm1',
        add_team_task: { ...task('new', 'todo'), title: args.p_title },
        set_team_task_status: { ...task(args.p_task_id, args.p_status) },
      }
      return Promise.resolve({ data: opts.rpcResult ?? defaults[fn] ?? null, error: null })
    },
    from: (_table: string) => ({
      select: (_sel?: string) => ({
        eq: () => ({
          order: () => Promise.resolve({ data: opts.tasks ?? opts.memberRows ?? [], error: null }),
          is: () => ({
            order: () => Promise.resolve({ data: opts.tasks ?? [], error: null }),
          }),
          maybeSingle: () => Promise.resolve({ data: opts.memberRows?.[0] ?? null, error: null }),
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: opts.memberRows?.[0] ?? null, error: null }),
          }),
        }),
      }),
    }),
  }
  return client as any
}

describe('team data access', () => {
  it('myTeam returns null when the user has no membership', async () => {
    expect(await myTeam(fakeClient({ memberRows: [] }), 'u1')).toBeNull()
  })
  it('myTeam returns the joined team', async () => {
    const c = fakeClient({ memberRows: [{ team_id: 'tm1', role: 'owner', teams: team }] })
    const t = await myTeam(c, 'u1')
    expect(t?.id).toBe('tm1')
    expect(t?.current_role).toBe('owner')
  })
  it('creates the team and owner membership through one atomic RPC', async () => {
    const c = fakeClient({})
    const t = await createTeam(c, '내과 의국', '길동')
    expect(t.name).toBe('내과 의국')
    expect(t.current_role).toBe('owner')
    expect(c.calls.map((x: any) => x.op)).toEqual(['rpc:create_team_atomic'])
  })
  it('joinTeamByCode calls the RPC', async () => {
    const c = fakeClient({ rpcResult: 'tm1' })
    expect(await joinTeamByCode(c, 'ABC123', '길동')).toBe('tm1')
    expect(c.calls[0].op).toBe('rpc:join_team_by_code')
  })
  it('listMembers returns team member rows', async () => {
    const rows = [{ team_id: 'tm1', user_id: 'u1', role: 'owner', nickname: '길동' }]
    const c = fakeClient({ memberRows: rows })
    expect(await listMembers(c, 'tm1')).toEqual(rows)
  })
  it('task CRUD works', async () => {
    const c = fakeClient({ tasks: [task('a', 'todo')] })
    expect(await listTeamTasks(c, 'tm1')).toHaveLength(1)
    const added = await addTeamTask(c, 'tm1', '컨퍼런스 준비', 'u1')
    expect(added.title).toBe('컨퍼런스 준비')
    const moved = await setTeamTaskStatus(c, 'a', 'doing')
    expect(moved.status).toBe('doing')
    await deleteTeamTask(c, 'a')
    expect(c.calls.at(-1).op).toBe('rpc:soft_delete_team_task')
  })
  it('uses audited RPCs for member management', async () => {
    const c = fakeClient()
    await setTeamMemberRole(c, 'tm1', 'u2', 'admin')
    await removeTeamMember(c, 'tm1', 'u2')
    await leaveTeam(c, 'tm1')
    await transferTeamOwnership(c, 'tm1', 'u2')
    expect(c.calls.map((call: any) => call.op)).toEqual([
      'rpc:set_team_member_role',
      'rpc:remove_team_member',
      'rpc:leave_team',
      'rpc:transfer_team_ownership',
    ])
  })
})

describe('teamProgress', () => {
  it('computes done ratio', () => {
    expect(teamProgress([task('a', 'done'), task('b', 'todo'), task('c', 'done'), task('d', 'doing')])).toBe(50)
  })
  it('is 0 for an empty board', () => {
    expect(teamProgress([])).toBe(0)
  })
})
