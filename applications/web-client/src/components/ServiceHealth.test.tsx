import {act, fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {ServiceHealth} from './ServiceHealth'
import type {ConnectHeartbeat, HeartbeatHandle, HeartbeatState} from '../protocol/heartbeat'

function makeConnectHeartbeat() {
  let notify: (state: HeartbeatState) => void = () => {}
  const handle: HeartbeatHandle = {stop: vi.fn(), retry: vi.fn()}

  const connectHeartbeat: ConnectHeartbeat = (onStateChange) => {
    notify = onStateChange
    return handle
  }

  const emit = (state: HeartbeatState) => act(() => notify(state))

  return {connectHeartbeat, emit, handle}
}

describe('ServiceHealth', () => {
  it('shows nothing while connecting', async () => {
    const {connectHeartbeat} = makeConnectHeartbeat()
    render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    expect(screen.queryByText(/service online/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/service offline/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/update available/i)).not.toBeInTheDocument()
  })

  it('shows service online when heartbeat is received', async () => {
    const {connectHeartbeat, emit} = makeConnectHeartbeat()
    render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    emit({status: 'online'})

    expect(screen.getByText('Service online')).toBeInTheDocument()
  })

  it('shows update available with download link when version is outdated', async () => {
    const {connectHeartbeat, emit} = makeConnectHeartbeat()
    render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    emit({status: 'update-available'})

    expect(screen.getByText('Update available')).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /download/i})).toHaveAttribute(
      'href',
      'https://github.com/RyanDur/battleship/releases/latest'
    )
  })

  it('shows reconnecting with attempt number', async () => {
    const {connectHeartbeat, emit} = makeConnectHeartbeat()
    render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    emit({status: 'reconnecting', attempt: 2})

    expect(screen.getByText('Reconnecting... (attempt 2)')).toBeInTheDocument()
  })

  it('shows service offline with retry button when disconnected', async () => {
    const {connectHeartbeat, emit} = makeConnectHeartbeat()
    render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    emit({status: 'disconnected'})

    expect(screen.getByText('Service offline')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Try again'})).toBeInTheDocument()
  })

  it('calls retry on the heartbeat handle when Try again is clicked', async () => {
    const {connectHeartbeat, emit, handle} = makeConnectHeartbeat()
    render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    emit({status: 'disconnected'})
    fireEvent.click(screen.getByRole('button', {name: 'Try again'}))

    expect(handle.retry).toHaveBeenCalledOnce()
  })

  it('stops the heartbeat handle when unmounted', async () => {
    const {connectHeartbeat, handle} = makeConnectHeartbeat()
    const {unmount} = render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    unmount()

    expect(handle.stop).toHaveBeenCalledOnce()
  })

  it('does not show online text while reconnecting', async () => {
    const {connectHeartbeat, emit} = makeConnectHeartbeat()
    render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    emit({status: 'reconnecting', attempt: 1})

    expect(screen.queryByText('Service online')).not.toBeInTheDocument()
  })

  it('does not show Gatekeeper-style instructions', async () => {
    const {connectHeartbeat, emit} = makeConnectHeartbeat()
    render(<ServiceHealth connectHeartbeat={connectHeartbeat}/>)

    emit({status: 'online'})

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
