import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiquidGlass } from './LiquidGlass'

describe('LiquidGlass', () => {
  it('renders children and applies the liquid-glass class plus overrides', () => {
    render(<LiquidGlass className="rounded-[28px]"><span>hi</span></LiquidGlass>)
    const el = screen.getByText('hi').parentElement!
    expect(el.className).toContain('liquid-glass')
    expect(el.className).toContain('rounded-[28px]')
  })
})
