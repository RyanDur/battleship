import type { PeerCommand, PeerEvent } from '../types/worker-messages'

type Deps = {
  emit: (event: PeerEvent) => void
  createPeerConnection: () => RTCPeerConnection
}

type Handler = {
  handleCommand: (command: PeerCommand) => void
}

type State =
  | { kind: 'idle' }
  | { kind: 'active'; pc: RTCPeerConnection }

const gatherIceCandidates = (pc: RTCPeerConnection): Promise<string | undefined> =>
  new Promise((resolve) => {
    const checkComplete = () => resolve(pc.localDescription?.sdp)
    if (pc.iceGatheringState === 'complete') { checkComplete(); return }
    pc.onicecandidate = ({ candidate }) => { if (candidate === null) checkComplete() }
  })

const wireChannel = (channel: RTCDataChannel, emit: (event: PeerEvent) => void) => {
  channel.onopen = () => emit({ type: 'PEER_CONNECTED' })
  channel.onclose = () => emit({ type: 'PEER_DISCONNECTED' })
}

const negotiateOffer = async (pc: RTCPeerConnection, emit: (event: PeerEvent) => void) => {
  const channel = pc.createDataChannel('game')
  wireChannel(channel, emit)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) emit({ type: 'OFFER_CREATED', sdp })
}

const negotiateAnswer = async (pc: RTCPeerConnection, emit: (event: PeerEvent) => void, remoteSdp: string) => {
  pc.ondatachannel = ({ channel }) => wireChannel(channel as RTCDataChannel, emit)

  await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp } as RTCSessionDescriptionInit)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) emit({ type: 'ANSWER_CREATED', sdp })
}

export const createPeerHandler = (deps: Deps): Handler => {
  let state: State = { kind: 'idle' }

  const handleCommand = (command: PeerCommand) => {
    switch (command.type) {
      case 'CREATE_OFFER': {
        const pc = deps.createPeerConnection()
        state = { kind: 'active', pc }
        negotiateOffer(pc, deps.emit)
        break
      }
      case 'ACCEPT_OFFER': {
        const pc = deps.createPeerConnection()
        state = { kind: 'active', pc }
        negotiateAnswer(pc, deps.emit, command.sdp)
        break
      }
      case 'ACCEPT_ANSWER':
        if (state.kind === 'active') {
          state.pc.setRemoteDescription({ type: 'answer', sdp: command.sdp } as RTCSessionDescriptionInit)
        }
        break
    }
  }

  return { handleCommand }
}
