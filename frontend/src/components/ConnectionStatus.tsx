type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'peer_connected'

const statusLabel: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected to service',
  peer_connected: 'Peer connected',
}

type Props = { status: ConnectionState }

export const ConnectionStatus = ({ status }: Props) => (
  <span>{statusLabel[status]}</span>
)
