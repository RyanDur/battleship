import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders', () => {
    render(<App />)
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })

  it('has a download link to the latest release', () => {
    render(<App />)
    const link = screen.getByRole('link', { name: /download/i })
    expect(link).toHaveAttribute('href', 'https://github.com/RyanDur/battleship/releases/latest')
  })
})
