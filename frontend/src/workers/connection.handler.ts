import type { WorkerCommand, WorkerEvent } from '../types/worker-messages'

type Deps = {
  postMessage: (event: WorkerEvent) => void
  createWebSocket: (url: string) => WebSocket
  createPeerConnection: () => RTCPeerConnection
}

type Handler = {
  handleCommand: (command: WorkerCommand) => void
}

type ConnectionState =
  | { kind: 'disconnected' }
  | { kind: 'connected'; ws: WebSocket }
  | { kind: 'negotiating'; ws: WebSocket; pc: RTCPeerConnection }

type Emit = (event: WorkerEvent) => void

const monitorIceState = (pc: RTCPeerConnection, emit: Emit) => {
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'connected') emit({ type: 'PEER_CONNECTED' })
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      emit({ type: 'PEER_DISCONNECTED' })
    }
  }
}

const gatherIceCandidates = (pc: RTCPeerConnection): Promise<string | undefined> =>
  new Promise((resolve) => {
    const checkComplete = () => resolve(pc.localDescription?.sdp)
    if (pc.iceGatheringState === 'complete') { checkComplete(); return }
    pc.onicecandidate = ({ candidate }) => { if (candidate === null) checkComplete() }
  })

const connect = (deps: Deps, token: string, serviceUrl: string): ConnectionState => {
  const url = `${serviceUrl}/ws/signaling?token=${token}`
  const ws = deps.createWebSocket(url)
  const emit = deps.postMessage

  ws.onopen = () => emit({ type: 'CONNECTED' })
  ws.onclose = (event) => emit({ type: 'DISCONNECTED', reason: event.reason ?? '' })

  return { kind: 'connected', ws }
}

const beginOffer = (deps: Deps, ws: WebSocket): ConnectionState => {
  const pc = deps.createPeerConnection()
  const emit = deps.postMessage

  monitorIceState(pc, emit)
  negotiateOffer(pc, emit)

  return { kind: 'negotiating', ws, pc }
}

const negotiateOffer = async (pc: RTCPeerConnection, emit: Emit) => {
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) emit({ type: 'OFFER_CREATED', sdp })
}

const beginAnswer = (deps: Deps, ws: WebSocket, remoteSdp: string): ConnectionState => {
  const pc = deps.createPeerConnection()
  const emit = deps.postMessage

  monitorIceState(pc, emit)
  negotiateAnswer(pc, emit, remoteSdp)

  return { kind: 'negotiating', ws, pc }
}

const negotiateAnswer = async (pc: RTCPeerConnection, emit: Emit, remoteSdp: string) => {
  await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp } as RTCSessionDescriptionInit)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) emit({ type: 'ANSWER_CREATED', sdp })
}

export const createConnectionHandler = (deps: Deps): Handler => {
  let state: ConnectionState = { kind: 'disconnected' }

  const transition = (next: ConnectionState) => { state = next }

  const handleCommand = (command: WorkerCommand) => {
    switch (command.type) {
      case 'CONNECT':
        transition(connect(deps, command.token, command.serviceUrl))
        break
      case 'DISCONNECT':
        if (state.kind === 'connected' || state.kind === 'negotiating') state.ws.close()
        break
      case 'CREATE_OFFER':
        if (state.kind === 'connected') transition(beginOffer(deps, state.ws))
        break
      case 'ACCEPT_OFFER':
        if (state.kind === 'connected') transition(beginAnswer(deps, state.ws, command.sdp))
        break
      case 'ACCEPT_ANSWER':
        if (state.kind === 'negotiating') {
          state.pc.setRemoteDescription({ type: 'answer', sdp: command.sdp } as RTCSessionDescriptionInit)
        }
        break
    }
  }

  return { handleCommand }
}
