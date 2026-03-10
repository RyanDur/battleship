import {render, screen} from '@testing-library/react'
import {ServiceHealth} from './ServiceHealth'

const EXPECTED_VERSION = '0.1.0'

describe('ServiceHealth', () => {
  it('shows service online when health check succeeds with matching version', async () => {
    const checkHealth = () => Promise.resolve({status: 'up' as const, version: EXPECTED_VERSION})

    render(<ServiceHealth checkHealth={checkHealth} expectedVersion={EXPECTED_VERSION}/>)

    expect(await screen.findByText('Service online')).toBeInTheDocument()
  })

  it('shows service offline when health check fails', async () => {
    const checkHealth = () => Promise.resolve(undefined)

    render(<ServiceHealth checkHealth={checkHealth} expectedVersion={EXPECTED_VERSION}/>)

    expect(await screen.findByText('Service offline')).toBeInTheDocument()
  })

  it('shows update available when version does not match', async () => {
    const checkHealth = () => Promise.resolve({status: 'up' as const, version: '0.0.1'})

    render(<ServiceHealth checkHealth={checkHealth} expectedVersion={EXPECTED_VERSION}/>)

    expect(await screen.findByText('Update available')).toBeInTheDocument()
    const link = screen.getByRole('link', {name: /download/i})
    expect(link).toHaveAttribute('href', 'https://github.com/RyanDur/battleship/releases/latest')
  })

  it('does not show update prompt when versions match', async () => {
    const checkHealth = () => Promise.resolve({status: 'up' as const, version: EXPECTED_VERSION})

    render(<ServiceHealth checkHealth={checkHealth} expectedVersion={EXPECTED_VERSION}/>)

    await screen.findByText('Service online')
    expect(screen.queryByText('Update available')).not.toBeInTheDocument()
  })
})
