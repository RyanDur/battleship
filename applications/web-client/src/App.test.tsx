import {render, screen} from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders', () => {
    render(<App/>)
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })

  it('has a download link', () => {
    render(<App/>)
    expect(screen.getByRole('link', {name: /download/i})).toBeInTheDocument()
  })
})
