import {useEffect, useState} from 'react'
import {Connections} from './components/Connections'
import {DownloadLink} from './components/DownloadLink'
import {ServiceHealth} from './components/ServiceHealth'
import {loadConfig} from './protocol/config'
import {encodeConnectionCode, decodeConnectionCode} from './protocol/connection-code'
import {fetchDownloadUrl} from './protocol/download'
import type {HeartbeatState} from './protocol/heartbeat'
import {useHeartbeat} from './hooks/useHeartbeat'
import {detectPlatform} from './protocol/platform'
import {createConnectionStore} from './state/connectionStore'
import {ConnectionProvider} from './state/ConnectionProvider'
import {createPeerHandler} from './workers/connection.handler'

const platform = detectPlatform(navigator.userAgent)

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const
  if (state.status === 'update-available') return 'upgrade' as const
  return 'download' as const
}

const App = () => {
  const [config, setConfig] = useState<Awaited<ReturnType<typeof loadConfig>> | null>(null)
  const {state: heartbeat, retry} = useHeartbeat(config)

  const [store] = useState(() => createConnectionStore({
    createHandler: (emit) => createPeerHandler({
      name: 'Player',
      createPeerConnection: () => new RTCPeerConnection(),
      emit,
    }),
    encodeCode: encodeConnectionCode,
    decodeCode: decodeConnectionCode,
  }))

  useEffect(() => {
    loadConfig().then(setConfig)
  }, [])

  return (
    <main>
      <h1>Battleship</h1>
      {config && (
        <ConnectionProvider store={store}>
          <ServiceHealth state={heartbeat} onRetry={retry}/>
          <DownloadLink platform={platform} action={actionFor(heartbeat)} fetchDownloadUrl={fetchDownloadUrl}/>
          <Connections serviceOnline={heartbeat.status === 'online'}/>
        </ConnectionProvider>
      )}
    </main>
  )
}

export {App}
