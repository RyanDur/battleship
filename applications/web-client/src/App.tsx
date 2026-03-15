import {useEffect, useRef, useState} from 'react'
import {DownloadLink} from './components/DownloadLink'
import {ServiceHealth} from './components/ServiceHealth'
import {loadConfig, type Config} from './protocol/config'
import {fetchDownloadUrl} from './protocol/download'
import {startHeartbeat} from './protocol/heartbeat'
import type {HeartbeatHandle, HeartbeatState} from './protocol/heartbeat'
import {detectPlatform} from './protocol/platform'

const platform = detectPlatform(navigator.userAgent)

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const
  if (state.status === 'update-available') return 'upgrade' as const
  return 'download' as const
}

const App = () => {
  const [config, setConfig] = useState<Config | null>(null)
  const [state, setState] = useState<HeartbeatState>({status: 'connecting'})
  const handleRef = useRef<HeartbeatHandle | null>(null)

  useEffect(() => {
    loadConfig().then(setConfig)
  }, [])

  useEffect(() => {
    if (!config) return
    const wsUrl = config.serviceUrl.replace(/^http/, 'ws') + '/ws/health'
    const handle = startHeartbeat(
      {createWebSocket: (url) => new WebSocket(url), url: wsUrl, expectedVersion: config.version},
      setState
    )
    handleRef.current = handle
    return () => handle.stop()
  }, [config])

  const retry = () => handleRef.current?.retry()

  return (
    <main>
      <h1>Battleship</h1>
      {config && (
        <>
          <ServiceHealth state={state} onRetry={retry}/>
          <DownloadLink platform={platform} action={actionFor(state)} fetchDownloadUrl={fetchDownloadUrl}/>
        </>
      )}
    </main>
  )
}

export {App}
