import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'
import { THEME_STORAGE_KEY } from './theme'
import { useTheme } from './useTheme'

function ThemeProbe() {
  const { theme } = useTheme()
  return <output aria-label="현재 테마">{theme}</output>
}

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  } satisfies Storage
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the light theme when there is no saved preference', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    expect(screen.getByLabelText('현재 테마')).toHaveTextContent('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('restores a saved theme and keeps the root class in sync', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    expect(screen.getByLabelText('현재 테마')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('toggles accessibly and persists the preference', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle showLabel />
        <ThemeProbe />
      </ThemeProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: '다크 모드로 전환' }))

    expect(screen.getByLabelText('현재 테마')).toHaveTextContent('dark')
    expect(screen.getByRole('button', { name: '라이트 모드로 전환' })).toBeInTheDocument()
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('requires a provider', () => {
    expect(() => render(<ThemeToggle />)).toThrow('useTheme must be used inside ThemeProvider')
  })
})
