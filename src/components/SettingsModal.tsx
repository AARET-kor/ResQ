import { useState } from 'react'
import { X } from 'lucide-react'
import { LiquidGlass } from './LiquidGlass'
import { SPECIALTIES } from '../mascot/roster'
import { parseInterests, type Profile } from '../lib/profile'

export function SettingsModal({
  profile,
  onSave,
  onClose,
}: {
  profile: Profile
  onSave: (v: { specialty: string; interests: string }) => void
  onClose: () => void
}) {
  const [specialty, setSpecialty] = useState(profile.specialty ?? '')
  const [interests, setInterests] = useState<string[]>(parseInterests(profile.interests))

  const toggleInterest = (name: string) =>
    setInterests((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]))

  const handleSave = () => onSave({ specialty, interests: interests.join(',') })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog">
      <LiquidGlass className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[24px] !bg-[#0a1240]/95">
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-grotesk text-xl uppercase">설정</h2>
            <button aria-label="닫기" onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10">
              <X size={14} />
            </button>
          </div>

          <label className="flex flex-col gap-1 font-mono text-xs uppercase text-cream/80">
            전공
            <select
              aria-label="전공"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-2 font-mono text-sm text-cream outline-none focus:ring-1 focus:ring-neon [&>option]:bg-bg"
            >
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="기타">기타</option>
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase text-cream/80">관심 전공</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SPECIALTIES.map((s) => (
                <label key={s} className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 font-mono text-xs text-cream">
                  <input
                    type="checkbox"
                    aria-label={s}
                    checked={interests.includes(s)}
                    onChange={() => toggleInterest(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            className="mt-2 rounded-md bg-neon px-4 py-3 font-grotesk text-sm uppercase text-bg transition hover:opacity-90"
          >
            저장
          </button>
        </div>
      </LiquidGlass>
    </div>
  )
}
