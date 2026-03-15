import * as Decoder from 'schemawax'
import { maybe } from '../lib/maybe'
import { tryCatch } from '../lib/result'
import type { PeerCommand, PeerEvent } from '../types/worker-messages'

const introduceDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCE'), name: Decoder.string },
})

const connectionsDecoder = Decoder.object({
  required: { type: Decoder.literal('CONNECTIONS'), names: Decoder.array(Decoder.string) },
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

type ChannelCallbacks = {
  onOpen: (peerId: string, channel: RTCDataChannel) => void
  onNameLearned: (peerId: string, name: string) => void
  onConnectionsReceived: (peerId: string, names: string[]) => void
  onClose: (peerId: string) => void
}

const wireChannel = (channel: RTCDataChannel, peerId: string, name: string, emit: (event: PeerEvent) => void, cbs: ChannelCallbacks) => {
  channel.onopen = () => {
    cbs.onOpen(peerId, channel)
    emit({ type: 'PEER_CONNECTED', peerId })
    channel.send(JSON.stringify({ type: 'INTRODUCE', name }))
  }
  channel.onclose = () => cbs.onClose(peerId)
  channel.onmessage = ({ data }: MessageEvent<string>) => {
    tryCatch(() => JSON.parse(data), () => 'invalid json')
      .onFailure(() => console.warn('Received malformed message from peer'))
      .onSuccess(parsed => {
        maybe(introduceDecoder.decode(parsed)).map(msg => {
          emit({ type: 'PEER_NAMED', peerId, name: msg.name })
          cbs.onNameLearned(peerId, msg.name)
        })
        maybe(connectionsDecoder.decode(parsed)).map(msg => cbs.onConnectionsReceived(peerId, msg.names))
      })
  }
}

const negotiateOffer = async (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, cbs: ChannelCallbacks) => {
  const channel = pc.createDataChannel('game')
  wireChannel(channel, peerId, name, emit, cbs)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) emit({ type: 'OFFER_CREATED', peerId, sdp })
}

const negotiateAnswer = async (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, remoteSdp: string, cbs: ChannelCallbacks) => {
  pc.ondatachannel = ({ channel }) => wireChannel(channel as RTCDataChannel, peerId, name, emit, cbs)

  await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp } as RTCSessionDescriptionInit)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) emit({ type: 'ANSWER_CREATED', peerId, sdp })
}

export const createPeerHandler = (deps: Deps): Handler => {
  const connections = new Map<string, RTCPeerConnection>()
  const peerNames = new Map<string, string>()
  const dataChannels = new Map<string, RTCDataChannel>()

  const broadcastConnections = () => {
    for (const [pid, ch] of dataChannels) {
      const names = [...peerNames.entries()].filter(([id]) => id !== pid).map(([, n]) => n)
      ch.send(JSON.stringify({ type: 'CONNECTIONS', names }))
    }
  }

  const cbs: ChannelCallbacks = {
    onOpen: (peerId, channel) => dataChannels.set(peerId, channel),
    onNameLearned: (peerId, name) => {
      peerNames.set(peerId, name)
      broadcastConnections()
    },
    onConnectionsReceived: (peerId, names) => deps.emit({ type: 'PEER_CONNECTIONS_UPDATED', peerId, connections: names }),
    onClose: (peerId) => {
      peerNames.delete(peerId)
      dataChannels.delete(peerId)
      const pc = connections.get(peerId)
      if (pc) { pc.close(); connections.delete(peerId) }
      broadcastConnections()
      deps.emit({ type: 'PEER_DISCONNECTED', peerId })
    },
  }

  const handleCommand = (command: PeerCommand) => {
    switch (command.type) {
      case 'CREATE_OFFER': {
        const peerId = generatePeerId()
        const pc = deps.createPeerConnection()
        connections.set(peerId, pc)
        negotiateOffer(pc, peerId, deps.name, deps.emit, cbs)
        break
      }
      case 'ACCEPT_OFFER': {
        const peerId = generatePeerId()
        const pc = deps.createPeerConnection()
        connections.set(peerId, pc)
        negotiateAnswer(pc, peerId, deps.name, deps.emit, command.sdp, cbs)
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
