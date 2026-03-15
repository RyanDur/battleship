import {useCallback, useEffect, useReducer, useState} from 'react'
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
  const [config, setConfig] = useState<Awaited<ReturnType<typeof loadConfig>> | null>(null)
  const {state: heartbeat, retry} = useHeartbeat(config)

  const [connections, dispatch] = useReducer(connectionsReducer, initialState)
  const {flow, peers} = connections

  const [handler] = useState(() => createPeerHandler({
    name: 'Player',
    createPeerConnection: () => new RTCPeerConnection(),
    emit: (event: PeerEvent) => {
      if (event.type === 'PEER_CONNECTED') dispatch({type: 'PEER_CONNECTED', peerId: event.peerId})
      else if (event.type === 'PEER_NAMED') dispatch({type: 'PEER_NAMED', peerId: event.peerId, name: event.name})
      else if (event.type === 'PEER_DISCONNECTED') dispatch({type: 'PEER_DISCONNECTED', peerId: event.peerId})
      else if (event.type === 'OFFER_CREATED') dispatch({type: 'OFFER_SDP_READY', peerId: event.peerId, sdp: event.sdp})
      else if (event.type === 'ANSWER_CREATED') dispatch({type: 'ANSWER_SDP_READY', sdp: event.sdp})
    },
  }))

  useEffect(() => {
    if (flow.phase === 'encoding-offer') {
      const {peerId, sdp, passphrase} = flow
      encodeConnectionCode(sdp, passphrase).then(code => dispatch({type: 'OFFER_ENCODED', peerId, code}))
    } else if (flow.phase === 'encoding-answer') {
      const {sdp, passphrase} = flow
      encodeConnectionCode(sdp, passphrase).then(code => dispatch({type: 'ANSWER_ENCODED', code}))
    }
  }, [flow])

  useEffect(() => {
    loadConfig().then(setConfig)
  }, [])

  const onCreateOffer = useCallback((passphrase: string) => {
    dispatch({type: 'CREATE_OFFER', passphrase})
    handler.handleCommand({type: 'CREATE_OFFER'})
  }, [handler])

  const onJoinOffer = useCallback(async (code: string, passphrase: string) => {
    dispatch({type: 'JOIN_OFFER', passphrase})
    const result = await decodeConnectionCode(code, passphrase)
    result
      .onSuccess(sdp => handler.handleCommand({type: 'ACCEPT_OFFER', sdp}))
      .onFailure(() => {
        console.warn('Failed to decode offer code — wrong passphrase?')
        dispatch({type: 'DECODE_FAILED'})
      })
  }, [handler])

  const onAcceptAnswer = async (responseCode: string) => {
    if (flow.phase !== 'offer-ready') return
    const result = await decodeConnectionCode(responseCode, flow.passphrase)
    result
      .onSuccess(sdp => handler.handleCommand({type: 'ACCEPT_ANSWER', peerId: flow.peerId, sdp}))
      .onFailure(() => console.warn('Failed to decode response code — wrong passphrase?'))
  }

  return (
    <main>
      <h1>Battleship</h1>
      {config && (
        <>
          <ServiceHealth state={heartbeat} onRetry={retry}/>
          <DownloadLink platform={platform} action={actionFor(heartbeat)} fetchDownloadUrl={fetchDownloadUrl}/>
          <Connections
            flow={toFlowPhase(flow)}
            peers={peers}
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
