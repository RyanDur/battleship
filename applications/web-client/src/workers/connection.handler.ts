import * as Decoder from 'schemawax'
import { maybe } from '../lib/maybe'
import type { PeerCommand, PeerEvent } from '../types/worker-messages'

const introduceDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCE'), name: Decoder.string },
})

type Deps = {
  name: string
  emit: (event: PeerEvent) => void
  createPeerConnection: () => RTCPeerConnection
}

type Handler = {
  handleCommand: (command: PeerCommand) => void
}

const generatePeerId = (): string => crypto.randomUUID()

const gatherIceCandidates = (pc: RTCPeerConnection): Promise<string | undefined> =>
  new Promise((resolve) => {
    const checkComplete = () => resolve(pc.localDescription?.sdp)
    if (pc.iceGatheringState === 'complete') { checkComplete(); return }
    pc.onicecandidate = ({ candidate }) => { if (candidate === null) checkComplete() }
  })

const wireChannel = (channel: RTCDataChannel, peerId: string, name: string, emit: (event: PeerEvent) => void) => {
  channel.onopen = () => {
    emit({ type: 'PEER_CONNECTED', peerId })
    channel.send(JSON.stringify({ type: 'INTRODUCE', name }))
  }
  channel.onclose = () => emit({ type: 'PEER_DISCONNECTED', peerId })
  channel.onmessage = ({ data }: MessageEvent<string>) => {
    maybe(introduceDecoder.decode(JSON.parse(data))).map(msg => emit({ type: 'PEER_NAMED', peerId, name: msg.name }))
  }
}

const negotiateOffer = async (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void) => {
  const channel = pc.createDataChannel('game')
  wireChannel(channel, peerId, name, emit)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) emit({ type: 'OFFER_CREATED', peerId, sdp })
}

const negotiateAnswer = async (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, remoteSdp: string) => {
  pc.ondatachannel = ({ channel }) => wireChannel(channel as RTCDataChannel, peerId, name, emit)

  await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp } as RTCSessionDescriptionInit)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) emit({ type: 'ANSWER_CREATED', peerId, sdp })
}

export const createPeerHandler = (deps: Deps): Handler => {
  const connections = new Map<string, RTCPeerConnection>()

  const handleCommand = (command: PeerCommand) => {
    switch (command.type) {
      case 'CREATE_OFFER': {
        const peerId = generatePeerId()
        const pc = deps.createPeerConnection()
        connections.set(peerId, pc)
        negotiateOffer(pc, peerId, deps.name, deps.emit)
        break
      }
      case 'ACCEPT_OFFER': {
        const peerId = generatePeerId()
        const pc = deps.createPeerConnection()
        connections.set(peerId, pc)
        negotiateAnswer(pc, peerId, deps.name, deps.emit, command.sdp)
        break
      }
      case 'ACCEPT_ANSWER': {
        const pc = connections.get(command.peerId)
        if (pc) pc.setRemoteDescription({ type: 'answer', sdp: command.sdp } as RTCSessionDescriptionInit)
        break
      }
      case 'DISCONNECT': {
        const pc = connections.get(command.peerId)
        if (pc) { pc.close(); connections.delete(command.peerId) }
        break
      }
    }
  }

  return { handleCommand }
}
