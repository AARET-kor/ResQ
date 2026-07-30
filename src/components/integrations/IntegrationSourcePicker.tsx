import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  Eye,
  ListTodo,
  LockKeyhole,
  TriangleAlert,
} from 'lucide-react'
import type {
  IntegrationSource,
  IntegrationSyncMode,
} from '../../lib/integrations'

function syncTime(value: string | null): string {
  if (!value) return '아직 동기화하지 않음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '동기화 기록 있음'
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000))
  if (elapsedMinutes < 1) return '방금 동기화'
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전 동기화`
  const elapsedHours = Math.round(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}시간 전 동기화`
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function SourceGroup({
  title,
  description,
  sources,
  pendingIds,
  disabled,
  onToggle,
  onModeChange,
}: {
  title: string
  description: string
  sources: IntegrationSource[]
  pendingIds: ReadonlySet<string>
  disabled: boolean
  onToggle: (source: IntegrationSource) => void
  onModeChange: (source: IntegrationSource, mode: IntegrationSyncMode) => void
}) {
  const Icon = sources[0]?.resource_type === 'task_list' ? ListTodo : CalendarDays

  if (!sources.length) return null

  return (
    <fieldset className="rounded-2xl border border-line/60 bg-surfaceRaised/45 p-3 sm:p-4">
      <legend className="px-2">
        <span className="inline-flex items-center gap-2 font-grotesk text-sm uppercase text-cream">
          <Icon size={15} className="text-neon" />
          {title}
        </span>
      </legend>
      <p className="mb-3 px-1 font-sans text-sm leading-relaxed text-cream/65">
        {description}
      </p>
      <div className="flex flex-col gap-2">
        {sources.map((source) => {
          const pending = pendingIds.has(source.id)
          return (
            <div
              key={source.id}
              className={`rounded-xl border p-3 transition ${
                source.selected
                  ? 'border-neon/35 bg-neon/[0.055]'
                  : 'border-cream/10 bg-cream/[0.025]'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={source.selected}
                  aria-label={`${source.name} ${source.selected ? '제외' : '포함'}`}
                  disabled={pending || disabled}
                  onClick={() => onToggle(source)}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition disabled:cursor-wait disabled:opacity-40 ${
                    source.selected
                      ? 'border-accent bg-accent text-accentInk'
                      : 'border-cream/25 text-transparent hover:border-neon/70'
                  }`}
                >
                  <Check size={14} strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {source.color && (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: source.color }}
                      />
                    )}
                    <strong className="min-w-0 truncate font-sans text-xs font-normal text-cream/85">
                      {source.name}
                    </strong>
                    {source.is_default && (
                      <span className="shrink-0 rounded-full border border-cream/15 px-2 py-0.5 font-sans text-xs text-cream/65">
                        기본
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-sans text-xs text-muted">
                    {syncTime(source.last_synced_at)}
                  </p>
                </div>
              </div>

              {source.selected && (
                <div className="mt-3 border-t border-cream/10 pt-3">
                  {source.can_write ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {([
                        {
                          mode: 'read_only' as const,
                          label: '가져오기만',
                          detail: '원본은 ResQ에서 수정하지 않음',
                          Icon: Eye,
                        },
                        {
                          mode: 'two_way' as const,
                          label: '양방향',
                          detail: 'ResQ 수정도 원본 앱에 반영',
                          Icon: ArrowLeftRight,
                        },
                      ]).map(({ mode, label, detail, Icon: ModeIcon }) => (
                        <button
                          key={mode}
                          type="button"
                          disabled={pending || disabled}
                          onClick={() => onModeChange(source, mode)}
                          className={`flex items-start gap-2 rounded-lg border p-2 text-left transition disabled:cursor-wait disabled:opacity-40 ${
                            source.sync_mode === mode
                              ? 'border-neon/45 bg-neon/10'
                              : 'border-cream/10 hover:border-cream/25'
                          }`}
                        >
                          <ModeIcon
                            size={14}
                            className={source.sync_mode === mode ? 'text-neon' : 'text-muted'}
                          />
                          <span>
                            <span className="block font-grotesk text-sm uppercase text-cream/80">
                              {label}
                            </span>
                            <span className="mt-0.5 block font-sans text-xs leading-relaxed text-muted">
                              {detail}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-cream/10 px-3 py-2">
                      <LockKeyhole size={13} className="text-muted" />
                      <span className="font-sans text-xs text-cream/65">
                        이 목록은 원본 서비스가 읽기 전용으로 제공합니다.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {source.last_error && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-400/10 px-3 py-2">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" />
                  <span className="font-sans text-xs leading-relaxed text-red-700/90 dark:text-red-200/80">
                    {source.last_error}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

export function IntegrationSourcePicker({
  sources,
  pendingIds = new Set(),
  disabled = false,
  onToggle,
  onModeChange,
}: {
  sources: IntegrationSource[]
  pendingIds?: ReadonlySet<string>
  disabled?: boolean
  onToggle: (source: IntegrationSource) => void
  onModeChange: (source: IntegrationSource, mode: IntegrationSyncMode) => void
}) {
  const calendars = sources.filter((source) => source.resource_type === 'calendar')
  const taskLists = sources.filter((source) => source.resource_type === 'task_list')
  const selected = sources.filter((source) => source.selected).length

  if (!sources.length) {
    return (
      <div className="rounded-2xl border border-dashed border-cream/15 px-4 py-5 text-center">
        <p className="font-sans text-sm leading-relaxed text-cream/65">
          아직 가져올 목록을 찾지 못했습니다.<br />
          위 단계의 ‘목록 찾기’를 눌러주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-sm text-cream/65">
          체크한 목록만 ResQ에 표시됩니다.
        </p>
        <span className={`rounded-full px-2.5 py-1 font-sans text-xs ${
          selected ? 'bg-neon/10 text-neon' : 'bg-amber-300/10 text-amber-800 dark:text-amber-200'
        }`}>
          {selected ? `${selected}개 선택` : '선택 필요'}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <SourceGroup
          title="캘린더"
          description="당직·외래·개인 일정 등 가져올 캘린더를 선택하세요."
          sources={calendars}
          pendingIds={pendingIds}
          disabled={disabled}
          onToggle={onToggle}
          onModeChange={onModeChange}
        />
        <SourceGroup
          title="할 일 목록"
          description="업무·개인 할 일 중 ResQ에서 함께 볼 목록을 선택하세요."
          sources={taskLists}
          pendingIds={pendingIds}
          disabled={disabled}
          onToggle={onToggle}
          onModeChange={onModeChange}
        />
      </div>
    </div>
  )
}
