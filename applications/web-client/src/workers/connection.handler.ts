import * as Decoder from 'schemawax'
import { maybe } from '../lib/maybe'
import { tryCatch } from '../lib/result'
import type { PeerCommand, PeerEvent } from '../types/worker-messages'

const introduceDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCE'), name: Decoder.string },
})

const trustDecoder = Decoder.object({
  required: { type: Decoder.literal('TRUST'), granted: Decoder.boolean },
})

const introductionDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION'), introId: Decoder.string, from: Decoder.string, peer: Decoder.string },
})

const introductionResponseDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_RESPONSE'), introId: Decoder.string, accepted: Decoder.boolean },
})

const createOfferForDecoder = Decoder.object({
  required: { type: Decoder.literal('CREATE_OFFER_FOR'), introId: Decoder.string },
})

const relaySdpDecoder = Decoder.object({
  required: { type: Decoder.literal('RELAY_SDP'), introId: Decoder.string, peerId: Decoder.string, sdp: Decoder.string },
})

const relaySdpAnswerDecoder = Decoder.object({
  required: { type: Decoder.literal('RELAY_SDP_ANSWER'), introId: Decoder.string, sdp: Decoder.string },
})

const introductionSdpDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_SDP'), introId: Decoder.string, sdp: Decoder.string },
})

const introductionSdpAnswerDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_SDP_ANSWER'), introId: Decoder.string, peerId: Decoder.string, sdp: Decoder.string },
})

const introductionDeclinedDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_DECLINED'), introId: Decoder.string },
})

const introductionExpiredDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_EXPIRED'), introId: Decoder.string },
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
  onClose: (peerId: string) => void
  onMessage: (peerId: string, parsed: unknown) => void
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
      .onSuccess(parsed => cbs.onMessage(peerId, parsed))
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

const negotiateIntroOffer = async (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, cbs: ChannelCallbacks, relayChannel: RTCDataChannel, introId: string) => {
  const channel = pc.createDataChannel('game')
  wireChannel(channel, peerId, name, emit, cbs)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) relayChannel.send(JSON.stringify({ type: 'RELAY_SDP', introId, peerId, sdp }))
}

const negotiateIntroAnswer = async (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, remoteSdp: string, cbs: ChannelCallbacks, relayChannel: RTCDataChannel, introId: string) => {
  pc.ondatachannel = ({ channel }) => wireChannel(channel as RTCDataChannel, peerId, name, emit, cbs)

  await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp } as RTCSessionDescriptionInit)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  const sdp = await gatherIceCandidates(pc)
  if (sdp) relayChannel.send(JSON.stringify({ type: 'RELAY_SDP_ANSWER', introId, sdp }))
}

export const createPeerHandler = (deps: Deps): Handler => {
  const connections = new Map<string, RTCPeerConnection>()
  const dataChannels = new Map<string, RTCDataChannel>()
  const peerNames = new Map<string, string>()

  type PendingIntro = {
    peerId1: string
    peerId2: string
    accepted: Set<string>
    relaySdpPeerId?: string
    timer: ReturnType<typeof setTimeout>
  }
  const pendingIntros = new Map<string, PendingIntro>()
  const introChannels = new Map<string, string>()

  const cbs: ChannelCallbacks = {
    onOpen: (peerId, channel) => dataChannels.set(peerId, channel),
    onClose: (peerId) => {
      dataChannels.delete(peerId)
      const pc = connections.get(peerId)
      if (pc) { pc.close(); connections.delete(peerId) }
      deps.emit({ type: 'PEER_DISCONNECTED', peerId })
    },
    onMessage: (peerId, parsed) => {
      maybe(introduceDecoder.decode(parsed)).map(msg => {
        peerNames.set(peerId, msg.name)
        deps.emit({ type: 'PEER_NAMED', peerId, name: msg.name })
      })
      maybe(trustDecoder.decode(parsed)).map(msg => {
        deps.emit({ type: 'PEER_TRUST_UPDATED', peerId, trusts: msg.granted })
      })
      maybe(introductionResponseDecoder.decode(parsed)).map(msg => {
        const intro = pendingIntros.get(msg.introId)
        if (!intro) return
        if (!msg.accepted) {
          clearTimeout(intro.timer)
          pendingIntros.delete(msg.introId)
          const otherPeerId = peerId === intro.peerId1 ? intro.peerId2 : intro.peerId1
          dataChannels.get(otherPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_DECLINED', introId: msg.introId }))
          return
        }
        intro.accepted.add(peerId)
        if (intro.accepted.size === 2) {
          clearTimeout(intro.timer)
          intro.timer = setTimeout(() => pendingIntros.delete(msg.introId), 60000)
          dataChannels.get(intro.peerId1)?.send(JSON.stringify({ type: 'CREATE_OFFER_FOR', introId: msg.introId }))
        }
      })
      maybe(relaySdpDecoder.decode(parsed)).map(msg => {
        const intro = pendingIntros.get(msg.introId)
        if (!intro) return
        intro.relaySdpPeerId = msg.peerId
        const otherPeerId = peerId === intro.peerId1 ? intro.peerId2 : intro.peerId1
        dataChannels.get(otherPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_SDP', introId: msg.introId, sdp: msg.sdp }))
      })
      maybe(relaySdpAnswerDecoder.decode(parsed)).map(msg => {
        const intro = pendingIntros.get(msg.introId)
        if (!intro) return
        clearTimeout(intro.timer)
        dataChannels.get(intro.peerId1)?.send(JSON.stringify({ type: 'INTRODUCTION_SDP_ANSWER', introId: msg.introId, peerId: intro.relaySdpPeerId, sdp: msg.sdp }))
        pendingIntros.delete(msg.introId)
      })
      maybe(introductionDecoder.decode(parsed)).map(msg => {
        introChannels.set(msg.introId, peerId)
        deps.emit({ type: 'INTRODUCTION_RECEIVED', introId: msg.introId, from: msg.from, peer: msg.peer })
      })
      maybe(createOfferForDecoder.decode(parsed)).map(msg => {
        const relayChannel = dataChannels.get(peerId)
        if (!relayChannel) return
        const newPeerId = generatePeerId()
        const pc = deps.createPeerConnection()
        connections.set(newPeerId, pc)
        negotiateIntroOffer(pc, newPeerId, deps.name, deps.emit, cbs, relayChannel, msg.introId)
      })
      maybe(introductionSdpAnswerDecoder.decode(parsed)).map(msg => {
        const pc = connections.get(msg.peerId)
        if (pc) pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp } as RTCSessionDescriptionInit)
      })
      maybe(introductionSdpDecoder.decode(parsed)).map(msg => {
        const relayChannel = dataChannels.get(peerId)
        if (!relayChannel) return
        const newPeerId = generatePeerId()
        const pc = deps.createPeerConnection()
        connections.set(newPeerId, pc)
        negotiateIntroAnswer(pc, newPeerId, deps.name, deps.emit, msg.sdp, cbs, relayChannel, msg.introId)
      })
      maybe(introductionDeclinedDecoder.decode(parsed)).map(msg => {
        introChannels.delete(msg.introId)
        deps.emit({ type: 'INTRODUCTION_DECLINED', introId: msg.introId })
      })
      maybe(introductionExpiredDecoder.decode(parsed)).map(msg => {
        introChannels.delete(msg.introId)
        deps.emit({ type: 'INTRODUCTION_EXPIRED', introId: msg.introId })
      })
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
      case 'GRANT_TRUST': {
        dataChannels.get(command.peerId)?.send(JSON.stringify({ type: 'TRUST', granted: true }))
        break
      }
      case 'REVOKE_TRUST': {
        dataChannels.get(command.peerId)?.send(JSON.stringify({ type: 'TRUST', granted: false }))
        break
      }
      case 'INTRODUCE_PEERS': {
        const ch1 = dataChannels.get(command.peerId1)
        const ch2 = dataChannels.get(command.peerId2)
        const name1 = peerNames.get(command.peerId1)
        const name2 = peerNames.get(command.peerId2)
        if (!ch1 || !ch2 || !name1 || !name2) break
        const introId = generatePeerId()
        const timer = setTimeout(() => {
          const intro = pendingIntros.get(introId)
          if (!intro) return
          pendingIntros.delete(introId)
          dataChannels.get(intro.peerId1)?.send(JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId }))
          dataChannels.get(intro.peerId2)?.send(JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId }))
        }, 60000)
        pendingIntros.set(introId, { peerId1: command.peerId1, peerId2: command.peerId2, accepted: new Set(), timer })
        ch1.send(JSON.stringify({ type: 'INTRODUCTION', introId, from: deps.name, peer: name2 }))
        ch2.send(JSON.stringify({ type: 'INTRODUCTION', introId, from: deps.name, peer: name1 }))
        break
      }
      case 'ACCEPT_INTRODUCTION': {
        const introducerPeerId = introChannels.get(command.introId)
        if (introducerPeerId) {
          introChannels.delete(command.introId)
          dataChannels.get(introducerPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId: command.introId, accepted: true }))
        }
        break
      }
      case 'DECLINE_INTRODUCTION': {
        const introducerPeerId = introChannels.get(command.introId)
        if (introducerPeerId) {
          introChannels.delete(command.introId)
          dataChannels.get(introducerPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId: command.introId, accepted: false }))
        }
        break
      }
    }
  }

  return { handleCommand }
}
