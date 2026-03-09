import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConnectionStatus } from './ConnectionStatus'

// Story #8: UI displays connection status

describe('ConnectionStatus', () => {
  it('shows Disconnected when status is disconnected', () => {
    render(<ConnectionStatus status="disconnected" />)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('shows Connecting when status is connecting', () => {
    render(<ConnectionStatus status="connecting" />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('shows Connected to service when status is connected', () => {
    render(<ConnectionStatus status="connected" />)
    expect(screen.getByText('Connected to service')).toBeInTheDocument()
  })

  it('shows Peer connected when status is peer_connected', () => {
    render(<ConnectionStatus status="peer_connected" />)
    expect(screen.getByText('Peer connected')).toBeInTheDocument()
  })
})
