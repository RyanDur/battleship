import {render, screen, waitFor} from '@testing-library/react'
import {App} from './App'

describe('App', () => {
  it('renders heading', async () => {
    render(<App/>)

    await waitFor(() => expect(screen.getByRole('heading')).toBeInTheDocument())
  })

  it('renders download link once config is loaded', async () => {
    render(<App/>)

    await waitFor(() => expect(screen.getByRole('link', {name: /download/i})).toBeInTheDocument())
  })
})
