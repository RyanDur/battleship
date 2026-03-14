import type {HeartbeatState} from '../protocol/heartbeat'

interface ServiceHealthProps {
  state: HeartbeatState
  onRetry: () => void
}

export const ServiceHealth = ({state, onRetry}: ServiceHealthProps) => {
  return (
    <section>
      {state.status === 'online' && <p>Service online</p>}
      {state.status === 'update-available' && <p>Update available</p>}
      {state.status === 'reconnecting' && (
        <p>Reconnecting... (attempt {state.attempt})</p>
      )}
      {state.status === 'disconnected' && (
        <>
          <p>Service offline</p>
          <button onClick={onRetry}>Try again</button>
        </>
      )}
    </section>
  )
}
