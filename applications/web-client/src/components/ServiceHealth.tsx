import {useEffect, useState} from 'react'

export type HealthResponse = { status: 'up'; version: string }
export type CheckHealth = () => Promise<HealthResponse | undefined>

type ServiceStatus = 'checking' | 'online' | 'offline' | 'update-available'

interface ServiceHealthProps {
  checkHealth: CheckHealth
  expectedVersion: string
}

export function ServiceHealth({checkHealth, expectedVersion}: ServiceHealthProps) {
  const [status, setStatus] = useState<ServiceStatus>('checking')

  useEffect(() => {
    checkHealth().then(response => {
      if (!response) setStatus('offline')
      else if (expectedVersion !== 'dev' && response.version !== expectedVersion) setStatus('update-available')
      else setStatus('online')
    })
  }, [checkHealth, expectedVersion])

  return (
    <section>
      {status === 'online' && <p>Service online</p>}
      {status === 'offline' && <p>Service offline</p>}
      {status === 'update-available' && (
        <>
          <p>Update available</p>
          <a href="https://github.com/RyanDur/battleship/releases/latest">Download latest version</a>
        </>
      )}
    </section>
  )
}
