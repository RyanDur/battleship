import type { WorkerCommand, WorkerEvent } from '../types/worker-messages'

type Deps = {
  postMessage: (event: WorkerEvent) => void
  createWebSocket: (url: string) => WebSocket
  createPeerConnection: () => RTCPeerConnection
}

type Handler = {
  handleCommand: (command: WorkerCommand) => void
}

type State = {
  ws: WebSocket | null
  pc: RTCPeerConnection | null
}

export const createConnectionHandler = (deps: Deps): Handler => {
  const state: State = { ws: null, pc: null }

  const emit = (event: WorkerEvent) => deps.postMessage(event)

  const connectWebSocket = (token: string, serviceUrl: string) => {
    const url = `${serviceUrl}/ws/signaling?token=${token}`
    const ws = deps.createWebSocket(url)

    ws.onopen = () => emit({ type: 'CONNECTED' })
    ws.onclose = (event) => emit({ type: 'DISCONNECTED', reason: (event as unknown as { reason: string }).reason ?? '' })

    state.ws = ws
  }

  const gatherComplete = (pc: RTCPeerConnection): Promise<void> =>
    new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return }
      pc.onicecandidate = ({ candidate }) => { if (candidate === null) resolve() }
    })

  const createOffer = async () => {
    const pc = deps.createPeerConnection()
    state.pc = pc

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected') emit({ type: 'PEER_CONNECTED' })
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        emit({ type: 'PEER_DISCONNECTED' })
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await gatherComplete(pc)

    const sdp = pc.localDescription?.sdp
    if (sdp) emit({ type: 'OFFER_CREATED', sdp })
  }

  const acceptOffer = async (sdp: string) => {
    const pc = deps.createPeerConnection()
    state.pc = pc

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected') emit({ type: 'PEER_CONNECTED' })
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        emit({ type: 'PEER_DISCONNECTED' })
      }
    }

    await pc.setRemoteDescription({ type: 'offer', sdp } as RTCSessionDescriptionInit)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await gatherComplete(pc)

    const localSdp = pc.localDescription?.sdp
    if (localSdp) emit({ type: 'ANSWER_CREATED', sdp: localSdp })
  }

  const acceptAnswer = async (sdp: string) => {
    if (!state.pc) return
    await state.pc.setRemoteDescription({ type: 'answer', sdp } as RTCSessionDescriptionInit)
  }

  const handleCommand = (command: WorkerCommand) => {
    switch (command.type) {
      case 'CONNECT':
        connectWebSocket(command.token, command.serviceUrl)
        break
      case 'DISCONNECT':
        state.ws?.close()
        break
      case 'CREATE_OFFER':
        createOffer()
        break
      case 'ACCEPT_OFFER':
        acceptOffer(command.sdp)
        break
      case 'ACCEPT_ANSWER':
        acceptAnswer(command.sdp)
        break
    }
  }

  return { handleCommand }
}
