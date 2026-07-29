import { Moon, Sun } from 'lucide-react'
import { useTheme } from './useTheme'

type ThemeToggleProps = {
  className?: string
  showLabel?: boolean
}

export function ThemeToggle({ className = '', showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? '라이트 모드로 전환' : '다크 모드로 전환'
  const Icon = isDark ? Sun : Moon

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={toggleTheme}
      className={`resq-theme-toggle gap-2 px-3 ${className}`}
    >
      <Icon aria-hidden size={18} strokeWidth={1.8} />
      {showLabel && <span>{isDark ? '라이트' : '다크'}</span>}
    </button>
  )
}
