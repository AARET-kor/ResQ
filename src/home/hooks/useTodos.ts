import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  addTodo,
  deleteTodo,
  listTodos,
  setTodoDone,
  type Todo,
  type TodoPriority,
} from '../../lib/todos'
import { requestTodoExtraction, type ExtractedTodo } from '../../lib/todoExtract'
import type { Profile } from '../../lib/profile'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'

interface UseTodosOptions {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}

export function useTodos({ profile, onProfileChange }: UseTodosOptions) {
  const { notify } = useNotifications()
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [addingExtracted, setAddingExtracted] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedTodo[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [reloadToken, setReloadToken] = useState(0)
  const addingRef = useRef(false)
  const extractingRef = useRef(false)
  const addingExtractedRef = useRef(false)
  const pendingIdsRef = useRef(new Set<string>())
  const userId = profile.id

  useEffect(() => {
    let active = true
    setLoading(true)
    listTodos(supabase, userId)
      .then((items) => { if (active) setTodos(items) })
      .catch((error) => {
        console.error(error)
        if (active) notify({
          message: requestErrorMessage(error, '할 일 목록을 불러오지 못했습니다.'),
          tone: 'error',
          action: { label: '재시도', onClick: () => setReloadToken((value) => value + 1) },
        })
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [notify, reloadToken, userId])

  const add = async (
    title: string,
    options: { priority: TodoPriority; dueDate: string | null; dueTime: string | null },
  ) => {
    if (addingRef.current) return false
    addingRef.current = true
    setAdding(true)
    try {
      const todo = await addTodo(supabase, userId, title, options.dueDate, {
        priority: options.priority,
        dueTime: options.dueTime,
      })
      setTodos((current) => [todo, ...current])
      return true
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '할 일을 추가하지 못했습니다. 입력 내용은 다시 시도할 수 있습니다.'),
        tone: 'error',
      })
      return false
    } finally {
      addingRef.current = false
      setAdding(false)
    }
  }

  const extract = async (input: { text?: string; imageBase64?: string; mediaType?: string }) => {
    if (extractingRef.current) return
    extractingRef.current = true
    setExtracting(true)
    try {
      setExtracted(await requestTodoExtraction(supabase, input, profile.specialty))
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '메모에서 할 일을 추출하지 못했습니다.'),
        tone: 'error',
        action: { label: '재시도', onClick: () => { void extract(input) } },
      })
    } finally {
      extractingRef.current = false
      setExtracting(false)
    }
  }

  const addExtracted = async (candidate: ExtractedTodo) => {
    if (addingExtractedRef.current) return false
    addingExtractedRef.current = true
    setAddingExtracted(true)
    try {
      const todo = await addTodo(supabase, userId, candidate.title, candidate.due_date, {
        priority: candidate.priority,
        dueTime: candidate.due_time,
      })
      setTodos((current) => [todo, ...current])
      setExtracted((current) => current.filter((item) => item !== candidate))
      return true
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '추출된 할 일을 저장하지 못했습니다.'),
        tone: 'error',
      })
      return false
    } finally {
      addingExtractedRef.current = false
      setAddingExtracted(false)
    }
  }

  const toggle = async (todo: Todo) => {
    if (pendingIdsRef.current.has(todo.id)) return
    const done = !todo.done
    const grantXp = done && !todo.xp_granted
    const optimistic = { ...todo, done, xp_granted: todo.xp_granted || grantXp }
    pendingIdsRef.current.add(todo.id)
    setPendingIds(new Set(pendingIdsRef.current))
    setTodos((current) => current.map((item) => (item.id === todo.id ? optimistic : item)))
    try {
      const result = await setTodoDone(supabase, todo.id, done)
      setTodos((current) => current.map((item) => (
        item.id === todo.id ? result.todo : item
      )))
      if (result.xpGrantedNow) onProfileChange(result.profile)
    } catch (error) {
      console.error(error)
      setTodos((current) => current.map((item) => (item.id === todo.id ? todo : item)))
      notify({
        message: requestErrorMessage(error, '할 일 상태를 변경하지 못해 이전 상태로 되돌렸습니다.'),
        tone: 'error',
        action: { label: '재시도', onClick: () => { void toggle(todo) } },
      })
    } finally {
      pendingIdsRef.current.delete(todo.id)
      setPendingIds(new Set(pendingIdsRef.current))
    }
  }

  const remove = async (id: string) => {
    if (pendingIdsRef.current.has(id)) return
    const removed = todos.find((todo) => todo.id === id)
    const removedIndex = todos.findIndex((todo) => todo.id === id)
    pendingIdsRef.current.add(id)
    setPendingIds(new Set(pendingIdsRef.current))
    setTodos((current) => current.filter((todo) => todo.id !== id))
    try {
      await deleteTodo(supabase, id)
    } catch (error) {
      console.error(error)
      if (removed) {
        setTodos((current) => {
          if (current.some((todo) => todo.id === id)) return current
          const next = [...current]
          next.splice(Math.max(0, removedIndex), 0, removed)
          return next
        })
      }
      notify({
        message: requestErrorMessage(error, '할 일을 삭제하지 못해 목록에 복원했습니다.'),
        tone: 'error',
        action: { label: '재시도', onClick: () => { void remove(id) } },
      })
    } finally {
      pendingIdsRef.current.delete(id)
      setPendingIds(new Set(pendingIdsRef.current))
    }
  }

  return {
    todos,
    loading,
    adding,
    extracting,
    addingExtracted,
    extracted,
    pendingIds,
    add,
    toggle,
    remove,
    refresh: () => setReloadToken((value) => value + 1),
    extract,
    addExtracted,
    dismissExtracted: () => setExtracted([]),
  }
}
