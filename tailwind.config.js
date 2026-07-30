/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        surfaceRaised: 'rgb(var(--color-surface-raised) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        accentInk: 'rgb(var(--color-accent-ink) / <alpha-value>)',
        // Keep the original tokens working while the UI moves to semantic names.
        bg: 'rgb(var(--color-canvas) / <alpha-value>)',
        cream: 'rgb(var(--color-ink) / <alpha-value>)',
        neon: 'rgb(var(--color-accent) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-ui)'],
        grotesk: ['var(--font-display)'],
        brand: ['var(--font-brand)'],
        condiment: ['Condiment', 'cursive'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        xs: ['13px', { lineHeight: '1.6' }],
        sm: ['15px', { lineHeight: '1.6' }],
        base: ['17px', { lineHeight: '1.65' }],
      },
    },
  },
  plugins: [],
}
