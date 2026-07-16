import { LiquidGlass } from '../LiquidGlass'
import { EVENT_KINDS } from '../../lib/events'
import type { ExtractedEvent } from '../../lib/gmail'

/**
 * External calendar integration card: push this month to Google Calendar,
 * download/subscribe to an .ics feed for Apple/Galaxy, and scan Gmail for
 * candidate schedule events awaiting review.
 */
export function SyncPanel({
  googleConnected,
  onSyncMonth,
  syncing = false,
  syncMessage,
  onDownloadIcs,
  feedUrl,
  onScanGmail,
  scanning,
  extracted,
  onAddExtracted,
  onDismissExtracted,
}: {
  googleConnected: boolean
  onSyncMonth: () => void
  syncing?: boolean
  syncMessage: string | null
  onDownloadIcs: () => void
  feedUrl: string | null
  onScanGmail: () => void
  scanning: boolean
  extracted: ExtractedEvent[]
  onAddExtracted: (ev: ExtractedEvent) => void
  onDismissExtracted: () => void
}) {
  return (
    <LiquidGlass className="rounded-[24px]">
      <div className="flex flex-col gap-4 p-6">
        <h3 className="font-grotesk text-2xl uppercase">외부 캘린더 연동</h3>

        {/* Google */}
        <div className="flex flex-col gap-2 rounded-md bg-white/5 px-4 py-3">
          <span className="font-mono text-[10px] uppercase text-cream/50">Google 캘린더</span>
          {googleConnected ? (
            <>
              <button onClick={onSyncMonth} disabled={syncing}
                className="self-start rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90 disabled:opacity-50">
                Google 캘린더로 이번 달 보내기
              </button>
              <span className="font-mono text-[10px] text-cream/50">30분 전 알림, 학회는 하루 전 추가</span>
            </>
          ) : (
            <span className="font-mono text-xs text-cream/60">
              Google 권한이 필요합니다 — 로그아웃 후 다시 로그인하면 캘린더/Gmail 권한을 요청합니다.
            </span>
          )}
        </div>

        {/* Apple / Galaxy */}
        <div className="flex flex-col gap-2 rounded-md bg-white/5 px-4 py-3">
          <span className="font-mono text-[10px] uppercase text-cream/50">아이폰 / 갤럭시</span>
          <button onClick={onDownloadIcs}
            className="self-start rounded-md border border-white/30 px-4 py-2 font-grotesk text-xs uppercase text-cream transition hover:bg-white/10">
            .ics 다운로드
          </button>
          {feedUrl && (
            <div className="flex flex-col gap-1">
              <code className="break-all rounded-md bg-black/30 px-3 py-2 font-mono text-[11px] text-cream/80">
                {feedUrl}
              </code>
              <span className="font-mono text-[10px] text-cream/50">
                아이폰/갤럭시 캘린더 앱에서 '구독 캘린더 추가'에 붙여넣기
              </span>
            </div>
          )}
        </div>

        {/* Gmail */}
        <div className="flex flex-col gap-2 rounded-md bg-white/5 px-4 py-3">
          <span className="font-mono text-[10px] uppercase text-cream/50">Gmail</span>
          {googleConnected && (
            <button onClick={onScanGmail} disabled={scanning}
              className="self-start rounded-md bg-neon px-4 py-2 font-grotesk text-xs uppercase text-bg transition hover:opacity-90 disabled:opacity-50">
              Gmail에서 일정 가져오기
            </button>
          )}
          {scanning && <span className="font-mono text-xs text-cream/60">메일을 읽는 중…</span>}
        </div>

        {syncMessage && (
          <p className="font-mono text-xs text-cream/70">{syncMessage}</p>
        )}

        {/* Extracted review list */}
        {extracted.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md bg-white/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-cream/50">가져온 일정 후보</span>
              <button onClick={onDismissExtracted}
                className="font-mono text-[10px] uppercase text-cream/40 transition hover:text-cream">
                닫기
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {extracted.map((ev, i) => (
                <li key={i} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
                  <span className="font-mono text-[10px] uppercase text-cream/60">
                    {ev.starts_at.slice(5, 10)} {ev.starts_at.slice(11, 16)}
                  </span>
                  <span className="flex-1 font-mono text-sm">{ev.title}</span>
                  <span className="font-mono text-[10px] uppercase text-cream/50">{EVENT_KINDS[ev.kind]}</span>
                  <button onClick={() => onAddExtracted(ev)}
                    className="rounded-md border border-white/30 px-3 py-1 font-grotesk text-[10px] uppercase text-cream transition hover:bg-white/10">
                    일정에 추가
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </LiquidGlass>
  )
}
