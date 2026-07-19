import { describe, it, expect } from 'vitest'
import { listTodos, addTodo, setTodoDone, deleteTodo, sortTodos, type Todo } from './todos'

function fakeClient(rows: Todo[]) {
  const calls: { op: string; args: any }[] = []
  const client = {
    calls,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
      insert: (values: any) => ({
        select: () => ({
          single: () => {
            calls.push({ op: 'insert', args: values })
            return Promise.resolve({ data: { id: 't-new', done: false, xp_granted: false, ...values }, error: null })
          },
        }),
      }),
      update: (values: any) => ({
        eq: (_c: string, id: string) => ({
          select: () => ({
            single: () => {
              calls.push({ op: 'update', args: { id, ...values } })
              const row = rows.find((r) => r.id === id)
              return Promise.resolve({ data: { ...row, ...values }, error: null })
            },
          }),
        }),
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          calls.push({ op: 'delete', args: { id } })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  return client as any
}

const t1: Todo = {
  id: 't1', user_id: 'u1', title: '회진 준비', done: false, due_date: null, xp_granted: false,
  priority: 'normal', due_time: null,
}

describe('todos data access', () => {
  it('lists todos', async () => {
    expect(await listTodos(fakeClient([t1]), 'u1')).toHaveLength(1)
  })
  it('adds a todo with the user id', async () => {
    const c = fakeClient([])
    const t = await addTodo(c, 'u1', '논문 읽기', null)
    expect(t.title).toBe('논문 읽기')
    expect(c.calls[0].args.user_id).toBe('u1')
    expect(c.calls[0].args.priority).toBe('normal')
  })
  it('adds a todo with priority and due time opts', async () => {
    const c = fakeClient([])
    await addTodo(c, 'u1', '회진', '2026-07-21', { priority: 'high', dueTime: '07:30' })
    expect(c.calls[0].args.priority).toBe('high')
    expect(c.calls[0].args.due_time).toBe('07:30')
    expect(c.calls[0].args.due_date).toBe('2026-07-21')
  })
  it('sets done state and xp_granted', async () => {
    const c = fakeClient([t1])
    const t = await setTodoDone(c, 't1', true, true)
    expect(t.done).toBe(true)
    expect(t.xp_granted).toBe(true)
  })
  it('deletes a todo', async () => {
    const c = fakeClient([t1])
    await deleteTodo(c, 't1')
    expect(c.calls[0]).toEqual({ op: 'delete', args: { id: 't1' } })
  })
})

describe('sortTodos', () => {
  const t = (o: Partial<Todo>): Todo => ({
    id: 'x', user_id: 'u', title: 't', done: false, due_date: null,
    xp_granted: false, priority: 'normal', due_time: null, ...o,
  })
  it('orders undone→priority→due datetime, done last', () => {
    const list = [
      t({ id: 'done', done: true, priority: 'high' }),
      t({ id: 'low', priority: 'low' }),
      t({ id: 'high-late', priority: 'high', due_date: '2026-07-22', due_time: '18:00' }),
      t({ id: 'high-early', priority: 'high', due_date: '2026-07-22', due_time: '08:00' }),
      t({ id: 'normal', priority: 'normal', due_date: '2026-07-21' }),
    ]
    expect(sortTodos(list).map((x) => x.id)).toEqual(['high-early', 'high-late', 'normal', 'low', 'done'])
  })
  it('does not mutate', () => {
    const list = [t({ id: 'a' }), t({ id: 'b', done: true })]
    sortTodos(list)
    expect(list[0].id).toBe('a')
  })
})
