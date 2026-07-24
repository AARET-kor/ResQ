import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import {
  NotificationContext,
  type NotificationInput,
  type NotificationItem,
} from './notificationContext'

const TONE_CLASS = {
  success: 'border-neon/40 bg-[#102a24] text-cream',
  error: 'border-red-400/50 bg-[#35151c] text-cream',
  warning: 'border-amber-300/50 bg-[#362b12] text-cream',
  info: 'border-sky-300/40 bg-[#10263a] text-cream',
} as const

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const sequence = useRef(0)
  const timers = useRef(new Map<number, number>())
  const offlineNotificationId = useRef<number | null>(null)

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const notify = useCallback((input: NotificationInput) => {
    const id = ++sequence.current
    const item: NotificationItem = {
      ...input,
      id,
      tone: input.tone ?? 'info',
    }
    setItems((current) => [...current.slice(-3), item])
    const durationMs = input.durationMs ?? 6000
    if (durationMs > 0) {
      timers.current.set(id, window.setTimeout(() => dismiss(id), durationMs))
    }
    return id
  }, [dismiss])

  useEffect(() => {
    const timerMap = timers.current
    const onOffline = () => {
      if (offlineNotificationId.current !== null) return
      offlineNotificationId.current = notify({
        message: '인터넷 연결이 끊겼습니다. 연결이 복구되면 다시 시도해주세요.',
        tone: 'warning',
        durationMs: 0,
      })
    }
    const onOnline = () => {
      if (offlineNotificationId.current !== null) {
        dismiss(offlineNotificationId.current)
        offlineNotificationId.current = null
      }
      notify({ message: '인터넷 연결이 복구되었습니다.', tone: 'success', durationMs: 3000 })
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      for (const timer of timerMap.values()) window.clearTimeout(timer)
      timerMap.clear()
    }
  }, [dismiss, notify])

  const api = useMemo(() => ({ notify, dismiss }), [dismiss, notify])

  return (
    <NotificationContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-label="알림"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-[380px]"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${TONE_CLASS[item.tone]}`}
          >
            <p className="flex-1 font-mono text-xs leading-relaxed">{item.message}</p>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  dismiss(item.id)
                  item.action?.onClick()
                }}
                className="shrink-0 rounded-md border border-white/30 px-2 py-1 font-mono text-[10px] uppercase transition hover:bg-white/10"
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="알림 닫기"
              onClick={() => dismiss(item.id)}
              className="shrink-0 text-cream/50 transition hover:text-cream"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}
