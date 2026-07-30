import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PlannerCandidate } from '../../../lib/plannerExtract'
import { PlannerAiInbox, type PlannerAiInboxProps } from './PlannerAiInbox'

const candidates: PlannerCandidate[] = [
  {
    id: 'todo-1',
    type: 'todo',
    title: '초록 제출',
    due_date: '2026-08-02',
    due_time: '17:00',
    priority: 'high',
  },
  {
    id: 'event-1',
    type: 'event',
    title: '교수님 미팅',
    starts_at: '2026-08-03T15:00:00+09:00',
    ends_at: '2026-08-03T16:00:00+09:00',
    location: '연구실',
    notes: null,
    kind: 'professor',
  },
]

function renderInbox(overrides: Partial<PlannerAiInboxProps> = {}) {
  const props: PlannerAiInboxProps = {
    candidates: [],
    selectedIds: new Set<string>(),
    onExtract: vi.fn(),
    onChangeCandidate: vi.fn(),
    onSelectionChange: vi.fn(),
    onSaveCandidate: vi.fn(),
    onSaveSelected: vi.fn(),
    onDismissCandidate: vi.fn(),
    onDismissAll: vi.fn(),
    ...overrides,
  }
  return {
    ...render(<PlannerAiInbox {...props} />),
    props,
  }
}

describe('PlannerAiInbox', () => {
  it('automatically analyzes pasted plain text while retaining the memo', () => {
    const onExtract = vi.fn()
    renderInbox({ onExtract })

    const inbox = screen.getByLabelText('AI 일정·할 일 인박스')
    fireEvent.paste(inbox, {
      clipboardData: {
        items: [],
        getData: () => '금요일 3시 교수님 미팅',
      },
    })

    expect(onExtract).toHaveBeenCalledWith({
      text: '금요일 3시 교수님 미팅',
    })
    expect(screen.getByLabelText('메모')).toHaveValue(
      '금요일 3시 교수님 미팅',
    )
  })

  it('reads a supported camera/photo file and requests extraction', async () => {
    const onExtract = vi.fn()
    renderInbox({ onExtract })
    const jpeg = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
      'memo.jpg',
      { type: 'image/jpeg' },
    )

    fireEvent.change(screen.getByLabelText('메모 또는 사진 파일 선택'), {
      target: { files: [jpeg] },
    })

    await waitFor(() => expect(onExtract).toHaveBeenCalled())
    expect(onExtract).toHaveBeenCalledWith(expect.objectContaining({
      mediaType: 'image/jpeg',
      imageBase64: expect.any(String),
    }))
  })

  it('analyzes memo text dropped onto the inbox', () => {
    const onExtract = vi.fn()
    renderInbox({ onExtract })

    fireEvent.drop(screen.getByLabelText('AI 일정·할 일 인박스'), {
      dataTransfer: {
        files: [],
        getData: () => '내일 오전 회진 준비',
      },
    })

    expect(onExtract).toHaveBeenCalledWith({
      text: '내일 오전 회진 준비',
    })
  })

  it('supports candidate editing, individual save, selection and bulk save', async () => {
    const user = userEvent.setup()
    const onChangeCandidate = vi.fn()
    const onSaveCandidate = vi.fn()
    const onSaveSelected = vi.fn()
    const onSelectionChange = vi.fn()
    renderInbox({
      candidates,
      selectedIds: new Set(['todo-1']),
      onChangeCandidate,
      onSaveCandidate,
      onSaveSelected,
      onSelectionChange,
    })

    const todoCard = screen.getByLabelText('초록 제출 AI 후보')
    await user.clear(within(todoCard).getByLabelText('초록 제출 제목'))
    await user.type(
      within(todoCard).getByLabelText('초록 제출 제목'),
      '수정된 초록 제출',
    )
    expect(onChangeCandidate).toHaveBeenCalled()

    await user.click(within(todoCard).getByRole('button', { name: '저장' }))
    expect(onSaveCandidate).toHaveBeenCalledWith(candidates[0])

    await user.click(within(todoCard).getByRole('checkbox'))
    expect(onSelectionChange).toHaveBeenCalledWith(new Set())

    await user.click(screen.getByRole('button', { name: '선택 1개 저장' }))
    expect(onSaveSelected).toHaveBeenCalledWith([candidates[0]])
  })

  it('keeps failed candidates visible and blocks duplicate bulk saves', () => {
    const candidateErrors = new Map([
      ['event-1', '네트워크 연결을 확인해 주세요.'],
    ])
    const onSaveSelected = vi.fn()
    renderInbox({
      candidates,
      selectedIds: new Set(candidates.map((candidate) => candidate.id)),
      candidateErrors,
      savingSelected: true,
      onSaveSelected,
    })

    expect(screen.getByLabelText('교수님 미팅 AI 후보')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '네트워크 연결을 확인해 주세요.',
    )
    const bulk = screen.getByRole('button', { name: '저장 중…' })
    expect(bulk).toBeDisabled()
    fireEvent.click(bulk)
    expect(onSaveSelected).not.toHaveBeenCalled()
  })
})
