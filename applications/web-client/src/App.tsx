import {useEffect, useState} from 'react'
import {Connections} from './components/Connections'
import type {FlowPhase} from './components/Connections'
import {DownloadLink} from './components/DownloadLink'
import {ServiceHealth} from './components/ServiceHealth'
import {loadConfig} from './protocol/config'
import {encodeConnectionCode, decodeConnectionCode} from './protocol/connection-code'
import {fetchDownloadUrl} from './protocol/download'
import type {HeartbeatState} from './protocol/heartbeat'
import {useHeartbeat} from './hooks/useHeartbeat'
import {detectPlatform} from './protocol/platform'
import type {ConnectionFlow} from './state/connections'
import {createConnectionStore} from './state/connectionStore'
import {createPeerHandler} from './workers/connection.handler'

const platform = detectPlatform(navigator.userAgent)

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const
  if (state.status === 'update-available') return 'upgrade' as const
  return 'download' as const
}

const toFlowPhase = (flow: ConnectionFlow): FlowPhase => {
  if (flow.phase === 'offer-ready') return {phase: 'offer-ready', code: flow.code}
  if (flow.phase === 'answer-ready') return {phase: 'answer-ready', code: flow.code}
  if (flow.phase === 'encoding-offer') return {phase: 'creating'}
  if (flow.phase === 'encoding-answer') return {phase: 'joining'}
  return {phase: flow.phase}
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

  const [connections, setConnections] = useState(store.getState())

  useEffect(() => store.subscribe(() => setConnections(store.getState())), [store])

  useEffect(() => {
    loadConfig().then(setConfig)
  }, [])

  return (
    <main>
      <h1>Battleship</h1>
      {config && (
        <>
          <ServiceHealth state={heartbeat} onRetry={retry}/>
          <DownloadLink platform={platform} action={actionFor(heartbeat)} fetchDownloadUrl={fetchDownloadUrl}/>
          <Connections
            flow={toFlowPhase(connections.flow)}
            peers={connections.peers}
            onCreateOffer={store.createOffer}
            onJoinOffer={store.joinOffer}
            onAcceptAnswer={store.acceptAnswer}
            serviceOnline={heartbeat.status === 'online'}
          />
        </>
      )}
    </main>
  )
}

export {App}
