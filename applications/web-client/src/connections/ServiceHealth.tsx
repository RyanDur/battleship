import type {HeartbeatState} from './heartbeat';

interface ServiceHealthProps {
  state: HeartbeatState
  onRetry: () => void
}

export const ServiceHealth = ({state, onRetry}: ServiceHealthProps) => {
  return (
    <output className="service-health" aria-live="polite">
      {state.status === 'online' && <p className="service-health-status">Service online</p>}
      {state.status === 'update-available' && <p className="service-health-status">Update available</p>}
      {state.status === 'reconnecting' && (
        <p className="service-health-status">Reconnecting... (attempt {state.attempt})</p>
      )}
      {state.status === 'disconnected' && (
        <>
          <p className="service-health-status">Service offline</p>
          <button className="control" onClick={onRetry}>Try again</button>
        </>
      )}
    </output>
  );
};
