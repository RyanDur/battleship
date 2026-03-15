import {useCallback, useEffect, useRef, useState} from 'react'
import {Connections} from './components/Connections'
import type {FlowPhase} from './components/Connections'
import {DownloadLink} from './components/DownloadLink'
import {ServiceHealth} from './components/ServiceHealth'
import {loadConfig, type Config} from './protocol/config'
import {encodeConnectionCode, decodeConnectionCode} from './protocol/connection-code'
import {fetchDownloadUrl} from './protocol/download'
import {startHeartbeat} from './protocol/heartbeat'
import type {HeartbeatHandle, HeartbeatState} from './protocol/heartbeat'
import {detectPlatform} from './protocol/platform'
import {createPeerHandler} from './workers/connection.handler'
import type {PeerEvent} from './types/worker-messages'

const platform = detectPlatform(navigator.userAgent)

type ConnectionFlow =
  | {phase: 'idle'}
  | {phase: 'creating'; passphrase: string}
  | {phase: 'offer-ready'; peerId: string; code: string; passphrase: string}
  | {phase: 'joining'; passphrase: string}
  | {phase: 'answer-ready'; code: string}

const toFlowPhase = (flow: ConnectionFlow): FlowPhase => {
  if (flow.phase === 'offer-ready') return {phase: 'offer-ready', code: flow.code}
  if (flow.phase === 'answer-ready') return {phase: 'answer-ready', code: flow.code}
  return {phase: flow.phase}
}

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const
  if (state.status === 'update-available') return 'upgrade' as const
  return 'download' as const
}

const App = () => {
  const [config, setConfig] = useState<Config | null>(null)
  const [state, setState] = useState<HeartbeatState>({status: 'connecting'})
  const handleRef = useRef<HeartbeatHandle | null>(null)
  const handlerRef = useRef<ReturnType<typeof createPeerHandler> | null>(null)

  const [flowState, setFlowState] = useState<ConnectionFlow>({phase: 'idle'})
  const flowRef = useRef<ConnectionFlow>({phase: 'idle'})

  const setFlow = useCallback((f: ConnectionFlow) => {
    flowRef.current = f
    setFlowState(f)
  }, [])

  const [peers, setPeers] = useState<{id: string; name?: string}[]>([])

  useEffect(() => {
    handlerRef.current = createPeerHandler({
      name: 'Player',
      createPeerConnection: () => new RTCPeerConnection(),
      emit: async (event: PeerEvent) => {
        if (event.type === 'PEER_CONNECTED') {
          setPeers(prev => [...prev, {id: event.peerId}])
        } else if (event.type === 'PEER_NAMED') {
          setPeers(prev => prev.map(p => p.id === event.peerId ? {...p, name: event.name} : p))
        } else if (event.type === 'PEER_DISCONNECTED') {
          setPeers(prev => prev.filter(p => p.id !== event.peerId))
        } else if (event.type === 'OFFER_CREATED') {
          const current = flowRef.current
          if (current.phase === 'creating') {
            const code = await encodeConnectionCode(event.sdp, current.passphrase)
            setFlow({phase: 'offer-ready', peerId: event.peerId, code, passphrase: current.passphrase})
          }
        } else if (event.type === 'ANSWER_CREATED') {
          const current = flowRef.current
          if (current.phase === 'joining') {
            const code = await encodeConnectionCode(event.sdp, current.passphrase)
            setFlow({phase: 'answer-ready', code})
          }
        }
      },
    })
  }, [setFlow])

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

  const onCreateOffer = (passphrase: string) => {
    setFlow({phase: 'creating', passphrase})
    handlerRef.current?.handleCommand({type: 'CREATE_OFFER'})
  }

  const onJoinOffer = async (code: string, passphrase: string) => {
    setFlow({phase: 'joining', passphrase})
    const result = await decodeConnectionCode(code, passphrase)
    result
      .onSuccess(sdp => handlerRef.current?.handleCommand({type: 'ACCEPT_OFFER', sdp}))
      .onFailure(() => {
        console.warn('Failed to decode offer code — wrong passphrase?')
        setFlow({phase: 'idle'})
      })
  }

  const onAcceptAnswer = async (responseCode: string) => {
    const current = flowRef.current
    if (current.phase !== 'offer-ready') return
    const result = await decodeConnectionCode(responseCode, current.passphrase)
    result
      .onSuccess(sdp => handlerRef.current?.handleCommand({type: 'ACCEPT_ANSWER', peerId: current.peerId, sdp}))
      .onFailure(() => console.warn('Failed to decode response code — wrong passphrase?'))
  }

  return (
    <main>
      <h1>Battleship</h1>
      {config && (
        <>
          <ServiceHealth state={state} onRetry={retry}/>
          <DownloadLink platform={platform} action={actionFor(state)} fetchDownloadUrl={fetchDownloadUrl}/>
          <Connections
            flow={toFlowPhase(flowState)}
            peers={peers}
            onCreateOffer={onCreateOffer}
            onJoinOffer={onJoinOffer}
            onAcceptAnswer={onAcceptAnswer}
            serviceOnline={state.status === 'online'}
          />
        </>
      )}
    </main>
  )
}

export {App}
