import { useState } from 'react'
import { X } from 'lucide-react'

export function GmailConsentDialog({
  busy,
  onConfirm,
  onShowPolicy,
  onClose,
}: {
  busy: boolean
  onConfirm: () => Promise<boolean>
  onShowPolicy: () => void
  onClose: () => void
}) {
  const [externalProcessing, setExternalProcessing] = useState(false)
  const [noPatientData, setNoPatientData] = useState(false)
  const [assistantOnly, setAssistantOnly] = useState(false)
  const ready = externalProcessing && noPatientData && assistantOnly

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog" aria-modal="true" aria-label="Gmail AI 처리 동의">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-grotesk text-2xl uppercase">Gmail AI 처리 동의</h3>
            <p className="mt-2 font-sans text-xs leading-relaxed text-cream/75">
              일정 후보를 찾기 위해 최근 메일의 마스킹된 제목과 본문을 외부 AI 처리업체에 전송합니다.
            </p>
          </div>
          <button aria-label="동의 창 닫기" onClick={onClose}
            className="shrink-0 text-cream/75 transition hover:text-cream">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <label className="flex items-start gap-3 rounded-xl bg-cream/5 p-3 font-sans text-xs leading-relaxed">
            <input type="checkbox" checked={externalProcessing}
              onChange={(event) => setExternalProcessing(event.target.checked)} className="mt-0.5" />
            마스킹된 이메일 제목·본문이 일정 추출 목적으로 Anthropic AI에 전송되는 것에 동의합니다.
          </label>
          <label className="flex items-start gap-3 rounded-xl bg-cream/5 p-3 font-sans text-xs leading-relaxed">
            <input type="checkbox" checked={noPatientData}
              onChange={(event) => setNoPatientData(event.target.checked)} className="mt-0.5" />
            환자명·등록번호·주민번호 등 환자정보가 포함된 메일은 분석하지 않겠습니다.
          </label>
          <label className="flex items-start gap-3 rounded-xl bg-cream/5 p-3 font-sans text-xs leading-relaxed">
            <input type="checkbox" checked={assistantOnly}
              onChange={(event) => setAssistantOnly(event.target.checked)} className="mt-0.5" />
            이 기능은 일정 정리를 위한 업무 보조 기능이며 진료·진단·치료 판단에 사용하지 않겠습니다.
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3">
          <p className="font-sans text-sm leading-relaxed text-amber-900 dark:text-amber-100">
            ResQ는 이메일 원문을 DB에 저장하지 않습니다. 자동 마스킹은 보조 안전장치이며 모든 민감정보를
            완벽히 탐지한다고 보장할 수 없습니다.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onShowPolicy}
            className="font-sans text-sm text-cream/70 underline">
            개인정보 처리·삭제 정책 보기
          </button>
          <button type="button" disabled={!ready || busy}
            onClick={async () => { if (await onConfirm()) onClose() }}
            className="rounded-md bg-accent px-4 py-2 font-grotesk text-xs uppercase text-accentInk disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? '저장 중…' : '동의하고 사용'}
          </button>
        </div>
      </div>
    </div>
  )
}
