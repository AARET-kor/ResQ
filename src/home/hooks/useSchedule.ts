import { useEffect, useRef, useState } from 'react'
import { monthRangeISO } from '../../lib/calendar'
import {
  addEvent,
  deleteEvent,
  listEventsInRange,
  type EventItem,
  type EventKind,
} from '../../lib/events'
import { supabase } from '../../lib/supabase'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'

export interface NewScheduleEvent {
  title: string
  starts_at: string
  kind: EventKind
}

export function useSchedule(userId: string) {
  const { notify } = useNotifications()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [reloadToken, setReloadToken] = useState(0)
  const addingRef = useRef(false)
  const deletingIdsRef = useRef(new Set<string>())
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month0, setMonth0] = useState(() => new Date().getMonth())

  useEffect(() => {
    let active = true
    setLoading(true)
    const { start, end } = monthRangeISO(year, month0)
    listEventsInRange(supabase, userId, start, end)
      .then((items) => { if (active) setEvents(items) })
      .catch((error) => {
        console.error(error)
        if (active) notify({
          message: requestErrorMessage(error, '일정을 불러오지 못했습니다.'),
          tone: 'error',
          action: { label: '재시도', onClick: () => setReloadToken((value) => value + 1) },
        })
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [month0, notify, reloadToken, userId, year])

  const add = async (values: NewScheduleEvent) => {
    if (addingRef.current) return false
    addingRef.current = true
    setAdding(true)
    try {
      const event = await addEvent(supabase, userId, values)
      const { start, end } = monthRangeISO(year, month0)
      const day = event.starts_at.slice(0, 10)
      if (day >= start && day < end) {
        setEvents((current) =>
          [...current, event].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
        )
      }
      return true
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(error, '일정을 추가하지 못했습니다.'),
        tone: 'error',
      })
      return false
    } finally {
      addingRef.current = false
      setAdding(false)
    }
  }

  const remove = async (id: string) => {
    if (deletingIdsRef.current.has(id)) return
    const removed = events.find((event) => event.id === id)
    const removedIndex = events.findIndex((event) => event.id === id)
    deletingIdsRef.current.add(id)
    setDeletingIds(new Set(deletingIdsRef.current))
    setEvents((current) => current.filter((event) => event.id !== id))
    try {
      await deleteEvent(supabase, id)
    } catch (error) {
      console.error(error)
      if (removed) {
        setEvents((current) => {
          if (current.some((event) => event.id === id)) return current
          const next = [...current]
          next.splice(Math.max(0, removedIndex), 0, removed)
          return next
        })
      }
      notify({
        message: requestErrorMessage(error, '일정을 삭제하지 못해 목록에 복원했습니다.'),
        tone: 'error',
        action: { label: '재시도', onClick: () => { void remove(id) } },
      })
    } finally {
      deletingIdsRef.current.delete(id)
      setDeletingIds(new Set(deletingIdsRef.current))
    }
  }

  const changeMonth = (nextYear: number, nextMonth0: number) => {
    setYear(nextYear)
    setMonth0(nextMonth0)
  }

  const markGoogleSynced = (eventId: string, googleEventId: string) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId ? { ...event, gcal_id: googleEventId } : event,
      ),
    )
  }

  return {
    events,
    loading,
    adding,
    deletingIds,
    year,
    month0,
    add,
    remove,
    changeMonth,
    markGoogleSynced,
  }
}
