import {useEffect, useRef, useState} from 'react'
import {RELEASES_PAGE} from '../protocol/download'
import type {ConnectHeartbeat, HeartbeatHandle, HeartbeatState} from '../protocol/heartbeat'

interface ServiceHealthProps {
  connectHeartbeat: ConnectHeartbeat
}

export function ServiceHealth({connectHeartbeat}: ServiceHealthProps) {
  const [state, setState] = useState<HeartbeatState>({status: 'connecting'})
  const handleRef = useRef<HeartbeatHandle | null>(null)

  useEffect(() => {
    const handle = connectHeartbeat(setState)
    handleRef.current = handle
    return () => handle.stop()
  }, [connectHeartbeat])

  const retry = () => handleRef.current?.retry()

  return (
    <section>
      {state.status === 'online' && <p>Service online</p>}
      {state.status === 'update-available' && (
        <>
          <p>Update available</p>
          <a href={RELEASES_PAGE}>Download latest version</a>
        </>
      )}
      {state.status === 'reconnecting' && (
        <p>Reconnecting... (attempt {state.attempt})</p>
      )}
      {state.status === 'disconnected' && (
        <>
          <p>Service offline</p>
          <button onClick={retry}>Try again</button>
        </>
      )}
    </section>
  )
}
