import {useCallback, useEffect, useReducer, useRef} from 'react'
import {Connections} from './components/Connections'
import type {FlowPhase} from './components/Connections'
import {DownloadLink} from './components/DownloadLink'
import {ServiceHealth} from './components/ServiceHealth'
import {loadConfig} from './protocol/config'
import {encodeConnectionCode, decodeConnectionCode} from './protocol/connection-code'
import {fetchDownloadUrl} from './protocol/download'
import {startHeartbeat} from './protocol/heartbeat'
import type {HeartbeatHandle, HeartbeatState} from './protocol/heartbeat'
import {detectPlatform} from './protocol/platform'
import {connectionsReducer, initialState} from './state/connections'
import {createPeerHandler} from './workers/connection.handler'
import type {PeerEvent} from './types/worker-messages'

const platform = detectPlatform(navigator.userAgent)

const actionFor = (state: HeartbeatState) => {
  if (state.status === 'online') return 'none' as const
  if (state.status === 'update-available') return 'upgrade' as const
  return 'download' as const
}

const toFlowPhase = (flow: ReturnType<typeof connectionsReducer>['flow']): FlowPhase => {
  if (flow.phase === 'offer-ready') return {phase: 'offer-ready', code: flow.code}
  if (flow.phase === 'answer-ready') return {phase: 'answer-ready', code: flow.code}
  if (flow.phase === 'encoding-offer') return {phase: 'creating'}
  if (flow.phase === 'encoding-answer') return {phase: 'joining'}
  return {phase: flow.phase}
}

const App = () => {
  const [heartbeat, setHeartbeat] = useReducer(
    (_: HeartbeatState, next: HeartbeatState) => next,
    {status: 'connecting'} as HeartbeatState
  )
  const [config, setConfig] = useReducer(
    (_: null | Awaited<ReturnType<typeof loadConfig>>, next: Awaited<ReturnType<typeof loadConfig>>) => next,
    null
  )
  const heartbeatHandleRef = useRef<HeartbeatHandle | null>(null)
  const handlerRef = useRef<ReturnType<typeof createPeerHandler> | null>(null)

  const [connections, dispatch] = useReducer(connectionsReducer, initialState)

  useEffect(() => {
    handlerRef.current = createPeerHandler({
      name: 'Player',
      createPeerConnection: () => new RTCPeerConnection(),
      emit: (event: PeerEvent) => {
        if (event.type === 'PEER_CONNECTED') dispatch({type: 'PEER_CONNECTED', peerId: event.peerId})
        else if (event.type === 'PEER_NAMED') dispatch({type: 'PEER_NAMED', peerId: event.peerId, name: event.name})
        else if (event.type === 'PEER_DISCONNECTED') dispatch({type: 'PEER_DISCONNECTED', peerId: event.peerId})
        else if (event.type === 'OFFER_CREATED') dispatch({type: 'OFFER_SDP_READY', peerId: event.peerId, sdp: event.sdp})
        else if (event.type === 'ANSWER_CREATED') dispatch({type: 'ANSWER_SDP_READY', sdp: event.sdp})
      },
    })
  }, [])

  useEffect(() => {
    const {flow} = connections
    if (flow.phase === 'encoding-offer') {
      const {peerId, sdp, passphrase} = flow
      encodeConnectionCode(sdp, passphrase).then(code => dispatch({type: 'OFFER_ENCODED', peerId, code}))
    } else if (flow.phase === 'encoding-answer') {
      const {sdp, passphrase} = flow
      encodeConnectionCode(sdp, passphrase).then(code => dispatch({type: 'ANSWER_ENCODED', code}))
    }
  }, [connections.flow])

  useEffect(() => {
    loadConfig().then(setConfig)
  }, [])

  useEffect(() => {
    if (!config) return
    const wsUrl = config.serviceUrl.replace(/^http/, 'ws') + '/ws/health'
    const handle = startHeartbeat(
      {createWebSocket: (url) => new WebSocket(url), url: wsUrl, expectedVersion: config.version},
      setHeartbeat
    )
    heartbeatHandleRef.current = handle
    return () => handle.stop()
  }, [config])

  const onCreateOffer = useCallback((passphrase: string) => {
    dispatch({type: 'CREATE_OFFER', passphrase})
    handlerRef.current?.handleCommand({type: 'CREATE_OFFER'})
  }, [])

  const onJoinOffer = useCallback(async (code: string, passphrase: string) => {
    dispatch({type: 'JOIN_OFFER', passphrase})
    const result = await decodeConnectionCode(code, passphrase)
    result
      .onSuccess(sdp => handlerRef.current?.handleCommand({type: 'ACCEPT_OFFER', sdp}))
      .onFailure(() => {
        console.warn('Failed to decode offer code — wrong passphrase?')
        dispatch({type: 'DECODE_FAILED'})
      })
  }, [])

  const onAcceptAnswer = useCallback(async (responseCode: string) => {
    const {flow} = connections
    if (flow.phase !== 'offer-ready') return
    const result = await decodeConnectionCode(responseCode, flow.passphrase)
    result
      .onSuccess(sdp => handlerRef.current?.handleCommand({type: 'ACCEPT_ANSWER', peerId: flow.peerId, sdp}))
      .onFailure(() => console.warn('Failed to decode response code — wrong passphrase?'))
  }, [connections])

  const retry = useCallback(() => heartbeatHandleRef.current?.retry(), [])

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
            onCreateOffer={onCreateOffer}
            onJoinOffer={onJoinOffer}
            onAcceptAnswer={onAcceptAnswer}
            serviceOnline={heartbeat.status === 'online'}
          />
        </>
      )}
    </main>
  )
}

export {App}
