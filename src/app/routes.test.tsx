import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppLink } from './AppLink'
import { useAppRoute } from './routes'

function RouteProbe() {
  const route = useAppRoute()
  return (
    <div>
      <span>{route}</span>
      <AppLink to="team">팀으로 이동</AppLink>
    </div>
  )
}

describe('app routes', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('moves between independent workspace paths without reloading', async () => {
    render(<RouteProbe />)
    expect(screen.getByText('home')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: '팀으로 이동' }))
    expect(window.location.pathname).toBe('/team')
    expect(screen.getByText('team')).toBeInTheDocument()
  })

  it('maps legacy section hashes to the new focused pages', () => {
    window.history.replaceState({}, '', '/#papers')
    render(<RouteProbe />)
    expect(window.location.pathname).toBe('/papers')
    expect(screen.getByText('papers')).toBeInTheDocument()
  })
})
