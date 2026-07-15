import { describe, it, expect } from 'vitest'
import {
  generateTeamCode, myTeam, createTeam, joinTeamByCode, listMembers,
  listTeamTasks, addTeamTask, setTeamTaskStatus, deleteTeamTask,
  teamProgress, type Team, type TeamTask,
} from './team'

const team: Team = { id: 'tm1', name: '내과 의국', code: 'ABC123', created_by: 'u1' }
const task = (id: string, status: TeamTask['status']): TeamTask =>
  ({ id, team_id: 'tm1', title: 't', status, assignee: null, due_date: null, created_by: 'u1' })

function fakeClient(opts: { memberRows?: any[]; teamRow?: Team | null; tasks?: TeamTask[]; rpcResult?: any } = {}) {
  const calls: { op: string; args: any }[] = []
  const client = {
    calls,
    rpc: (fn: string, args: any) => {
      calls.push({ op: `rpc:${fn}`, args })
      return Promise.resolve({ data: opts.rpcResult ?? 'tm1', error: null })
    },
    from: (table: string) => ({
      select: (_sel?: string) => ({
        eq: () => ({
          order: () => Promise.resolve({ data: opts.tasks ?? opts.memberRows ?? [], error: null }),
          maybeSingle: () => Promise.resolve({ data: opts.memberRows?.[0] ?? null, error: null }),
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: opts.memberRows?.[0] ?? null, error: null }),
          }),
        }),
      }),
      insert: (values: any) => ({
        select: () => ({
          single: () => {
            calls.push({ op: `insert:${table}`, args: values })
            if (table === 'teams') return Promise.resolve({ data: { ...team, ...values }, error: null })
            return Promise.resolve({ data: { id: 'new', status: 'todo', ...values }, error: null })
          },
        }),
      }),
      update: (values: any) => ({
        eq: (_c: string, id: string) => ({
          select: () => ({
            single: () => {
              calls.push({ op: `update:${table}`, args: { id, ...values } })
              return Promise.resolve({ data: { ...task(id, 'todo'), ...values }, error: null })
            },
          }),
        }),
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          calls.push({ op: `delete:${table}`, args: { id } })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  return client as any
}

describe('generateTeamCode', () => {
  it('makes a 6-char uppercase alphanumeric code', () => {
    const c = generateTeamCode(() => 0.5)
    expect(c).toHaveLength(6)
    expect(c).toMatch(/^[A-Z0-9]{6}$/)
  })
})

describe('team data access', () => {
  it('myTeam returns null when the user has no membership', async () => {
    expect(await myTeam(fakeClient({ memberRows: [] }), 'u1')).toBeNull()
  })
  it('myTeam returns the joined team', async () => {
    const c = fakeClient({ memberRows: [{ team_id: 'tm1', teams: team }] })
    const t = await myTeam(c, 'u1')
    expect(t?.id).toBe('tm1')
  })
  it('createTeam inserts the team then self-membership', async () => {
    const c = fakeClient({})
    const t = await createTeam(c, 'u1', '내과 의국', '길동', () => 0.5)
    expect(t.name).toBe('내과 의국')
    expect(c.calls.map((x: any) => x.op)).toEqual(['insert:teams', 'insert:team_members'])
  })
  it('joinTeamByCode calls the RPC', async () => {
    const c = fakeClient({ rpcResult: 'tm1' })
    expect(await joinTeamByCode(c, 'ABC123', '길동')).toBe('tm1')
    expect(c.calls[0].op).toBe('rpc:join_team_by_code')
  })
  it('listMembers returns team member rows', async () => {
    const rows = [{ team_id: 'tm1', user_id: 'u1', role: 'resident', nickname: '길동' }]
    const c = fakeClient({ memberRows: rows })
    expect(await listMembers(c, 'tm1')).toEqual(rows)
  })
  it('task CRUD works', async () => {
    const c = fakeClient({ tasks: [task('a', 'todo')] })
    expect(await listTeamTasks(c, 'tm1')).toHaveLength(1)
    const added = await addTeamTask(c, 'tm1', 'u1', '컨퍼런스 준비', null)
    expect(added.title).toBe('컨퍼런스 준비')
    const moved = await setTeamTaskStatus(c, 'a', 'doing')
    expect(moved.status).toBe('doing')
    await deleteTeamTask(c, 'a')
    expect(c.calls.at(-1).op).toBe('delete:team_tasks')
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
