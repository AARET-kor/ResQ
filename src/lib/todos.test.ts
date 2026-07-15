import { describe, it, expect } from 'vitest'
import { listTodos, addTodo, setTodoDone, deleteTodo, type Todo } from './todos'

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

const t1: Todo = { id: 't1', user_id: 'u1', title: '회진 준비', done: false, due_date: null, xp_granted: false }

describe('todos data access', () => {
  it('lists todos', async () => {
    expect(await listTodos(fakeClient([t1]), 'u1')).toHaveLength(1)
  })
  it('adds a todo with the user id', async () => {
    const c = fakeClient([])
    const t = await addTodo(c, 'u1', '논문 읽기', null)
    expect(t.title).toBe('논문 읽기')
    expect(c.calls[0].args.user_id).toBe('u1')
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
