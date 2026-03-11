import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {ServiceHealth} from './ServiceHealth'

const noop = () => {}

describe('ServiceHealth', () => {
  it('shows nothing while connecting', () => {
    render(<ServiceHealth state={{status: 'connecting'}} onRetry={noop}/>)

    expect(screen.queryByText(/service online/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/service offline/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/update available/i)).not.toBeInTheDocument()
  })

  it('shows service online when online', () => {
    render(<ServiceHealth state={{status: 'online'}} onRetry={noop}/>)

    expect(screen.getByText('Service online')).toBeInTheDocument()
  })

  it('shows update available when version is outdated', () => {
    render(<ServiceHealth state={{status: 'update-available'}} onRetry={noop}/>)

    expect(screen.getByText('Update available')).toBeInTheDocument()
  })

  it('shows reconnecting with attempt number', () => {
    render(<ServiceHealth state={{status: 'reconnecting', attempt: 2}} onRetry={noop}/>)

    expect(screen.getByText('Reconnecting... (attempt 2)')).toBeInTheDocument()
  })

  it('shows service offline with retry button when disconnected', () => {
    render(<ServiceHealth state={{status: 'disconnected'}} onRetry={noop}/>)

    expect(screen.getByText('Service offline')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Try again'})).toBeInTheDocument()
  })

  it('calls onRetry when Try again is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ServiceHealth state={{status: 'disconnected'}} onRetry={onRetry}/>)

    await user.click(screen.getByRole('button', {name: 'Try again'}))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not show online text while reconnecting', () => {
    render(<ServiceHealth state={{status: 'reconnecting', attempt: 1}} onRetry={noop}/>)

    expect(screen.queryByText('Service online')).not.toBeInTheDocument()
  })

  it('does not show a retry button when online', () => {
    render(<ServiceHealth state={{status: 'online'}} onRetry={noop}/>)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
