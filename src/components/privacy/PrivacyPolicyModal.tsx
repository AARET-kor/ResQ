import { X } from 'lucide-react'
import type { GmailAuditEvent } from '../../lib/privacy'

export function PrivacyPolicyModal({
  audits,
  deleting,
  onDeleteAudits,
  onClose,
}: {
  audits: GmailAuditEvent[]
  deleting: boolean
  onDeleteAudits: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/75 p-4 sm:items-center"
      role="dialog" aria-modal="true" aria-label="개인정보 처리 안내">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-[#EFF5EC] p-6 text-[#1c3325] shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-grotesk text-2xl uppercase">개인정보 처리 안내</h3>
            <p className="font-mono text-[11px] text-[#1c3325]/60">정책 버전 2026-07-24</p>
          </div>
          <button aria-label="정책 닫기" onClick={onClose}
            className="text-[#1c3325]/60 transition hover:text-[#1c3325]">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-4 font-mono text-xs leading-relaxed">
          <section>
            <h4 className="font-bold">처리 목적과 전송 범위</h4>
            <p>최근 Gmail에서 일정 후보를 찾기 위해 제목과 일반 텍스트 본문을 읽습니다. 브라우저와 서버에서 환자 식별정보 패턴을 마스킹한 뒤 Anthropic AI에 일정 추출 목적으로 전송합니다.</p>
          </section>
          <section>
            <h4 className="font-bold">저장 및 삭제</h4>
            <p>ResQ DB에는 이메일 제목과 본문을 저장하지 않습니다. 처리 시각, 메일 수, 마스킹 후 문자 수, 성공 여부, 후보 수와 토큰 사용량만 최대 1년 보관합니다. 아래 버튼으로 본인의 감사 기록을 즉시 삭제할 수 있습니다.</p>
          </section>
          <section>
            <h4 className="font-bold">사용자 주의사항</h4>
            <p>자동 마스킹은 모든 민감정보 탐지를 보장하지 않습니다. 환자명, 등록번호, 주민번호, 검사 결과 등 환자정보가 포함된 메일에는 이 기능을 사용하지 마세요.</p>
          </section>
          <section>
            <h4 className="font-bold">업무 보조 면책</h4>
            <p>ResQ가 제안하는 일정은 사용자가 직접 검토해야 합니다. 본 기능은 진료·진단·치료 또는 응급 의사결정을 위한 의료기기가 아니며 의료적 판단을 대신하지 않습니다.</p>
          </section>
        </div>

        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-mono text-xs font-bold uppercase">최근 처리 기록</h4>
            <button type="button" onClick={onDeleteAudits} disabled={deleting || audits.length === 0}
              className="rounded border border-[#1c3325]/30 px-3 py-1 font-mono text-[10px] disabled:opacity-40">
              {deleting ? '삭제 중…' : '기록 삭제'}
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {audits.map((audit) => (
              <li key={audit.id} className="rounded-lg bg-[#1c3325]/5 px-3 py-2 font-mono text-[11px]">
                {new Date(audit.created_at).toLocaleString('ko-KR')} · {audit.status} · 메일 {audit.email_count}건
                {audit.candidates_count != null ? ` · 후보 ${audit.candidates_count}건` : ''}
              </li>
            ))}
            {audits.length === 0 && (
              <li className="font-mono text-[11px] text-[#1c3325]/60">저장된 처리 기록이 없습니다.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
