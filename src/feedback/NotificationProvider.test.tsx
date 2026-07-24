import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotificationProvider } from './NotificationProvider'
import { useNotifications } from './notificationContext'

function RetryProbe({ onRetry }: { onRetry: () => void }) {
  const { notify } = useNotifications()
  return (
    <button
      onClick={() => notify({
        message: '저장에 실패했습니다.',
        tone: 'error',
        action: { label: '재시도', onClick: onRetry },
      })}
    >
      알림 만들기
    </button>
  )
}

describe('NotificationProvider', () => {
  it('shows a global notification and runs its retry action', async () => {
    const onRetry = vi.fn()
    render(
      <NotificationProvider>
        <RetryProbe onRetry={onRetry} />
      </NotificationProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: '알림 만들기' }))
    expect(screen.getByRole('alert')).toHaveTextContent('저장에 실패했습니다.')

    await userEvent.click(screen.getByRole('button', { name: '재시도' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('announces offline and online transitions', () => {
    render(
      <NotificationProvider>
        <div />
      </NotificationProvider>,
    )
    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByText(/인터넷 연결이 끊겼습니다/)).toBeInTheDocument()

    act(() => window.dispatchEvent(new Event('online')))
    expect(screen.queryByText(/인터넷 연결이 끊겼습니다/)).not.toBeInTheDocument()
    expect(screen.getByText(/인터넷 연결이 복구되었습니다/)).toBeInTheDocument()
  })
})
