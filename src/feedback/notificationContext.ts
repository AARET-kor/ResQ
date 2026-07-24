import { createContext, useContext } from 'react'

export type NotificationTone = 'success' | 'error' | 'warning' | 'info'

export interface NotificationAction {
  label: string
  onClick: () => void
}

export interface NotificationInput {
  message: string
  tone?: NotificationTone
  action?: NotificationAction
  /** Set to 0 for a notification that stays until dismissed. */
  durationMs?: number
}

export interface NotificationItem extends NotificationInput {
  id: number
  tone: NotificationTone
}

export interface NotificationApi {
  notify: (input: NotificationInput) => number
  dismiss: (id: number) => void
}

export const NotificationContext = createContext<NotificationApi | null>(null)

export function useNotifications(): NotificationApi {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within NotificationProvider')
  return context
}
