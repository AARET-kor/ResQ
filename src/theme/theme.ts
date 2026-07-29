export const THEME_STORAGE_KEY = 'resq-theme'

export type Theme = 'light' | 'dark'

export const THEME_COLORS: Record<Theme, string> = {
  light: '#f6f8f5',
  dark: '#071114',
}

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : null
  } catch {
    return null
  }
}

export function getInitialTheme(): Theme {
  if (typeof document !== 'undefined' && isTheme(document.documentElement.dataset.theme)) {
    return document.documentElement.dataset.theme
  }
  return getStoredTheme() ?? 'light'
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme])
}

export function storeTheme(theme: Theme) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Theme changes still work when storage is disabled.
  }
}
