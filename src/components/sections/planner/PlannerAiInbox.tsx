import {
  Camera,
  CheckCheck,
  ClipboardPaste,
  FileImage,
  LoaderCircle,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import {
  PLANNER_EXTRACT_MAX_IMAGE_BYTES,
  PLANNER_EXTRACT_MAX_TEXT_CHARS,
  validatePlannerExtractionInput,
  type PlannerCandidate,
  type PlannerCaptureInput,
} from '../../../lib/plannerExtract'
import { PlannerCandidateCard } from './PlannerCandidateCard'

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp'

function readImageAsBase64(file: File): Promise<PlannerCaptureInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('사진을 읽지 못했습니다.'))
        return
      }
      const comma = reader.result.indexOf(',')
      resolve({
        imageBase64: reader.result.slice(comma + 1),
        mediaType: file.type,
      })
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('사진을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '입력을 처리하지 못했습니다. 다시 시도해 주세요.'
}

export interface PlannerAiInboxProps {
  candidates: PlannerCandidate[]
  selectedIds: ReadonlySet<string>
  extracting?: boolean
  savingSelected?: boolean
  savingIds?: ReadonlySet<string>
  candidateErrors?: ReadonlyMap<string, string>
  onExtract: (
    input: PlannerCaptureInput,
  ) => void | Promise<void>
  onChangeCandidate: (candidate: PlannerCandidate) => void
  onSelectionChange: (selectedIds: Set<string>) => void
  onSaveCandidate: (
    candidate: PlannerCandidate,
  ) => void | Promise<void>
  onSaveSelected: (
    candidates: PlannerCandidate[],
  ) => void | Promise<void>
  onDismissCandidate: (id: string) => void
  onDismissAll: () => void
}

export function PlannerAiInbox({
  candidates,
  selectedIds,
  extracting = false,
  savingSelected = false,
  savingIds = new Set<string>(),
  candidateErrors = new Map<string, string>(),
  onExtract,
  onChangeCandidate,
  onSelectionChange,
  onSaveCandidate,
  onSaveSelected,
  onDismissCandidate,
  onDismissAll,
}: PlannerAiInboxProps) {
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const selectedCandidates = candidates.filter((candidate) =>
    selectedIds.has(candidate.id))
  const allSelected = candidates.length > 0
    && selectedCandidates.length === candidates.length
  const anySaving = savingSelected || savingIds.size > 0

  const extract = async (input: PlannerCaptureInput) => {
    if (extracting) return
    try {
      setInputError(null)
      validatePlannerExtractionInput(input)
      await onExtract(input)
    } catch (error) {
      setInputError(messageFor(error))
    }
  }

  const extractFile = async (file: File) => {
    if (file.type === 'text/plain') {
      const fileText = await file.text()
      await extract({ text: fileText })
      return
    }
    if (file.size > PLANNER_EXTRACT_MAX_IMAGE_BYTES) {
      setInputError('사진은 25MB 이하여야 합니다.')
      return
    }
    try {
      await extract(await readImageAsBase64(file))
    } catch (error) {
      setInputError(messageFor(error))
    }
  }

  const submitText = (event: FormEvent) => {
    event.preventDefault()
    const value = text.trim()
    if (value) void extract({ text: value })
  }

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    const imageItem = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith('image/'))
    if (imageItem) {
      event.preventDefault()
      const file = imageItem.getAsFile()
      if (file) void extractFile(file)
      return
    }
    const pastedText = event.clipboardData.getData('text/plain').trim()
    if (!pastedText) return
    event.preventDefault()
    setText(pastedText)
    void extract({ text: pastedText })
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) {
      void extractFile(file)
      return
    }
    const droppedText = event.dataTransfer.getData('text/plain').trim()
    if (droppedText) {
      setText(droppedText)
      void extract({ text: droppedText })
    }
  }

  const setCandidateSelected = (id: string, selected: boolean) => {
    const next = new Set(selectedIds)
    if (selected) next.add(id)
    else next.delete(id)
    onSelectionChange(next)
  }

  const toggleAll = () => {
    onSelectionChange(
      allSelected
        ? new Set()
        : new Set(candidates.map((candidate) => candidate.id)),
    )
  }

  return (
    <section
      className="planner-ai-inbox"
      aria-label="AI 일정·할 일 인박스"
      onPaste={handlePaste}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }}
      onDrop={handleDrop}
    >
      <header className="planner-ai-inbox__header">
        <div className="planner-ai-inbox__identity">
          <span className="planner-ai-inbox__icon">
            <Sparkles aria-hidden size={20} />
          </span>
          <div>
            <p className="planner-kicker">AI inbox</p>
            <h3>메모와 사진을 일정·할 일로 정리</h3>
            <p>
              붙여넣거나 사진을 올리면 날짜와 실행 항목을 자동으로
              구분합니다.
            </p>
          </div>
        </div>
        {candidates.length > 0 && (
          <span className="plan-count">{candidates.length}개 후보</span>
        )}
      </header>

      <div
        className={`planner-ai-dropzone ${
          dragging ? 'planner-ai-dropzone--dragging' : ''
        }`}
      >
        <form onSubmit={submitText} className="planner-ai-input">
          <label htmlFor="planner-ai-memo">메모</label>
          <textarea
            id="planner-ai-memo"
            value={text}
            maxLength={PLANNER_EXTRACT_MAX_TEXT_CHARS}
            disabled={extracting}
            onChange={(event) => setText(event.target.value)}
            placeholder={'예: 금요일 오후 3시 교수님 미팅\n내일까지 수술 케이스 요약 제출'}
          />
          <div className="planner-ai-input__meta">
            <span>
              {text.length.toLocaleString()} / {' '}
              {PLANNER_EXTRACT_MAX_TEXT_CHARS.toLocaleString()}자
            </span>
            <button
              type="submit"
              disabled={extracting || !text.trim()}
              className="resq-primary-button"
            >
              {extracting
                ? <LoaderCircle aria-hidden size={16} className="animate-spin" />
                : <Sparkles aria-hidden size={16} />}
              {extracting ? '분석 중…' : 'AI로 정리'}
            </button>
          </div>
        </form>

        <div className="planner-ai-files">
          <ClipboardPaste aria-hidden size={23} />
          <strong>
            {dragging ? '여기에 놓아주세요' : '붙여넣기 또는 드래그'}
          </strong>
          <span>JPEG, PNG, GIF, WebP · 최대 25MB</span>
          <div className="planner-ai-files__actions">
            <button
              type="button"
              disabled={extracting}
              onClick={() => fileInputRef.current?.click()}
              className="resq-secondary-button"
            >
              <Upload aria-hidden size={15} />
              사진 선택
            </button>
            <button
              type="button"
              disabled={extracting}
              onClick={() => cameraInputRef.current?.click()}
              className="resq-secondary-button"
            >
              <Camera aria-hidden size={15} />
              카메라
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={`${IMAGE_ACCEPT},text/plain`}
            aria-label="메모 또는 사진 파일 선택"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void extractFile(file)
              event.target.value = ''
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            capture="environment"
            aria-label="카메라로 메모 촬영"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void extractFile(file)
              event.target.value = ''
            }}
          />
        </div>
      </div>

      {inputError && (
        <p className="planner-ai-inbox__error" role="alert">
          <FileImage aria-hidden size={16} />
          {inputError}
        </p>
      )}

      {extracting && candidates.length === 0 && (
        <div className="planner-ai-inbox__loading" aria-live="polite">
          <LoaderCircle aria-hidden size={22} className="animate-spin" />
          <strong>내용을 읽고 있습니다</strong>
          <span>일정과 할 일을 나누고 날짜를 확인하는 중입니다.</span>
        </div>
      )}

      {candidates.length > 0 && (
        <>
          <div className="planner-ai-reviewbar">
            <button
              type="button"
              onClick={toggleAll}
              disabled={anySaving}
              className="resq-text-action"
            >
              <CheckCheck aria-hidden size={15} />
              {allSelected ? '전체 선택 해제' : '전체 선택'}
            </button>
            <span>{selectedCandidates.length}개 선택됨</span>
            <button
              type="button"
              onClick={onDismissAll}
              disabled={anySaving}
              className="resq-text-action"
            >
              <Trash2 aria-hidden size={14} />
              모두 비우기
            </button>
            <button
              type="button"
              disabled={selectedCandidates.length === 0 || anySaving}
              onClick={() => onSaveSelected(selectedCandidates)}
              className="resq-primary-button"
            >
              {anySaving
                ? <LoaderCircle aria-hidden size={15} className="animate-spin" />
                : <CheckCheck aria-hidden size={15} />}
              {anySaving
                ? '저장 중…'
                : `선택 ${selectedCandidates.length}개 저장`}
            </button>
          </div>
          <div className="planner-candidate-list">
            {candidates.map((candidate) => (
              <PlannerCandidateCard
                key={candidate.id}
                candidate={candidate}
                selected={selectedIds.has(candidate.id)}
                saving={savingIds.has(candidate.id)}
                error={candidateErrors.get(candidate.id)}
                onSelect={(selected) =>
                  setCandidateSelected(candidate.id, selected)}
                onChange={onChangeCandidate}
                onSave={onSaveCandidate}
                onDismiss={onDismissCandidate}
              />
            ))}
          </div>
        </>
      )}

      <p className="planner-ai-inbox__privacy">
        붙여넣은 원문과 사진은 후보를 만드는 데만 사용되며 워크스테이션에
        원문으로 저장되지 않습니다. 환자 식별정보는 입력하지 마세요.
      </p>
    </section>
  )
}
