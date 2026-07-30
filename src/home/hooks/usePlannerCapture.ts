import { useRef, useState } from 'react'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'
import {
  requestPlannerExtraction,
  type PlannerCandidate,
  type PlannerCaptureInput,
} from '../../lib/plannerExtract'
import { supabase } from '../../lib/supabase'
import type { EventDraft, TodoDraftOptions } from '../../components/sections/planner/workstationShared'

interface UsePlannerCaptureOptions {
  specialty: string | null
  onAddEvent: (
    event: EventDraft,
  ) => boolean | void | Promise<boolean | void>
  onAddTodo: (
    title: string,
    options: TodoDraftOptions,
  ) => boolean | void | Promise<boolean | void>
  onShowDate?: (date: string) => void
}

function candidateValidationError(candidate: PlannerCandidate): string | null {
  if (!candidate.title.trim()) return '제목을 입력해 주세요.'
  if (candidate.type === 'todo') {
    if (candidate.due_time && !candidate.due_date) {
      return '시간을 지정하려면 마감일도 선택해 주세요.'
    }
    return null
  }
  const start = Date.parse(candidate.starts_at)
  if (!Number.isFinite(start)) return '올바른 시작 날짜와 시간을 선택해 주세요.'
  if (
    candidate.ends_at
    && (
      !Number.isFinite(Date.parse(candidate.ends_at))
      || Date.parse(candidate.ends_at) <= start
    )
  ) {
    return '종료 시간은 시작 시간보다 뒤여야 합니다.'
  }
  return null
}

export function usePlannerCapture({
  specialty,
  onAddEvent,
  onAddTodo,
  onShowDate,
}: UsePlannerCaptureOptions) {
  const { notify } = useNotifications()
  const [candidates, setCandidates] = useState<PlannerCandidate[]>([])
  const [selectedIds, setSelectedIdsState] = useState<Set<string>>(
    () => new Set(),
  )
  const [candidateErrors, setCandidateErrors] = useState<Map<string, string>>(
    () => new Map(),
  )
  const [extracting, setExtracting] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set())
  const [savingSelected, setSavingSelected] = useState(false)
  const extractingRef = useRef(false)
  const savingIdsRef = useRef(new Set<string>())
  const savingSelectedRef = useRef(false)
  const lastInputRef = useRef<PlannerCaptureInput | null>(null)

  const extract = async (input: PlannerCaptureInput) => {
    if (extractingRef.current) return false
    extractingRef.current = true
    lastInputRef.current = input
    setExtracting(true)
    try {
      const result = await requestPlannerExtraction(
        supabase,
        input,
        specialty,
      )
      const next = [...result.events, ...result.todos]
      setCandidates(next)
      setSelectedIdsState(new Set(next.map((candidate) => candidate.id)))
      setCandidateErrors(new Map())
      if (next.length === 0) {
        notify({
          message: '명확한 일정이나 할 일을 찾지 못했습니다. 날짜와 행동을 조금 더 구체적으로 적어주세요.',
          tone: 'info',
        })
      }
      return true
    } catch (error) {
      console.error(error)
      notify({
        message: requestErrorMessage(
          error,
          '메모·사진에서 일정과 할 일을 찾지 못했습니다.',
        ),
        tone: 'error',
        action: {
          label: '재시도',
          onClick: () => {
            if (lastInputRef.current) void extract(lastInputRef.current)
          },
        },
      })
      return false
    } finally {
      extractingRef.current = false
      setExtracting(false)
    }
  }

  const updateCandidate = (candidate: PlannerCandidate) => {
    setCandidates((current) => current.map((item) =>
      item.id === candidate.id ? candidate : item,
    ))
    setCandidateErrors((current) => {
      if (!current.has(candidate.id)) return current
      const next = new Map(current)
      next.delete(candidate.id)
      return next
    })
  }

  const toggleSelected = (id: string) => {
    setSelectedIdsState((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const dismissCandidate = (id: string) => {
    setCandidates((current) => current.filter((item) => item.id !== id))
    setSelectedIdsState((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setCandidateErrors((current) => {
      if (!current.has(id)) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }

  const dismissAll = () => {
    setCandidates([])
    setSelectedIdsState(new Set())
    setCandidateErrors(new Map())
  }

  const persistCandidate = async (
    candidate: PlannerCandidate,
  ): Promise<boolean> => {
    if (savingIdsRef.current.has(candidate.id)) return false
    const validationError = candidateValidationError(candidate)
    if (validationError) {
      setCandidateErrors((current) => new Map(current).set(
        candidate.id,
        validationError,
      ))
      return false
    }
    savingIdsRef.current.add(candidate.id)
    setSavingIds(new Set(savingIdsRef.current))
    try {
      const saved = candidate.type === 'todo'
        ? await onAddTodo(candidate.title.trim(), {
            priority: candidate.priority,
            dueDate: candidate.due_date,
            dueTime: candidate.due_time,
            sourceProvider: null,
            externalSourceId: null,
            syncStatus: 'synced',
          })
        : await onAddEvent({
            title: candidate.title.trim(),
            starts_at: candidate.starts_at,
            ends_at: candidate.ends_at,
            location: candidate.location,
            notes: candidate.notes,
            kind: candidate.kind,
            source_provider: null,
            external_source_id: null,
            sync_status: 'synced',
          })
      if (saved === false) {
        setCandidateErrors((current) => new Map(current).set(
          candidate.id,
          '연결 상태를 확인한 뒤 다시 저장해 주세요.',
        ))
        return false
      }
      dismissCandidate(candidate.id)
      return true
    } catch (error) {
      setCandidateErrors((current) => new Map(current).set(
        candidate.id,
        requestErrorMessage(error, '저장 요청에 실패했습니다.'),
      ))
      return false
    } finally {
      savingIdsRef.current.delete(candidate.id)
      setSavingIds(new Set(savingIdsRef.current))
    }
  }

  const saveCandidate = async (candidate: PlannerCandidate) => {
    const saved = await persistCandidate(candidate)
    if (!saved) return false
    notify({
      message: candidate.type === 'event'
        ? 'AI 일정 후보를 워크스테이션에 추가했습니다.'
        : 'AI 할 일 후보를 워크스테이션에 추가했습니다.',
      tone: 'success',
    })
    if (candidate.type === 'event') {
      onShowDate?.(candidate.starts_at.slice(0, 10))
    }
    return true
  }

  const saveSelectedCandidates = async () => {
    if (savingSelectedRef.current) return
    const queue = candidates.filter((candidate) =>
      selectedIds.has(candidate.id),
    )
    if (queue.length === 0) {
      notify({ message: '저장할 후보를 선택해주세요.', tone: 'warning' })
      return
    }

    savingSelectedRef.current = true
    setSavingSelected(true)
    let savedCount = 0
    try {
      // The todo and event hooks each intentionally allow only one in-flight
      // write. Keep this sequential so every reviewed candidate gets a chance.
      for (const candidate of queue) {
        if (await persistCandidate(candidate)) savedCount += 1
      }
      const failedCount = queue.length - savedCount
      notify({
        message: failedCount
          ? `${savedCount}개를 저장했고 ${failedCount}개는 검토 목록에 남겼습니다.`
          : `${savedCount}개 항목을 워크스테이션에 추가했습니다.`,
        tone: failedCount ? 'warning' : 'success',
      })
      const lastSavedEvent = [...queue].reverse().find(
        (candidate) => candidate.type === 'event',
      )
      if (lastSavedEvent?.type === 'event' && failedCount === 0) {
        onShowDate?.(lastSavedEvent.starts_at.slice(0, 10))
      }
    } finally {
      savingSelectedRef.current = false
      setSavingSelected(false)
    }
  }

  return {
    candidates,
    selectedIds,
    candidateErrors,
    extracting,
    savingIds,
    savingSelected,
    extract,
    retry: () => lastInputRef.current
      ? extract(lastInputRef.current)
      : Promise.resolve(false),
    updateCandidate,
    toggleSelected,
    setSelectedIds: (ids: Set<string>) => setSelectedIdsState(new Set(ids)),
    saveCandidate,
    saveSelected: saveSelectedCandidates,
    dismissCandidate,
    dismissAll,
  }
}
