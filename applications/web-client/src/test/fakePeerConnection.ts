export type FakeDataChannel = {
  onopen: (() => void) | null
  onclose: (() => void) | null
  onmessage: ((event: {data: string}) => void) | null
  send: (data: string) => void
  close: () => void
}

type ChannelPair = {offererChannel: FakeDataChannel; answererChannel: FakeDataChannel}

const createUnpairedChannel = (): FakeDataChannel => {
  const ch: FakeDataChannel = {
    onopen: null,
    onclose: null,
    onmessage: null,
    send: () => {},
    close: () => {
      const h = ch.onclose
      ch.onclose = null
      h?.()
    },
  }
  return ch
}

const pairChannels = (offererCh: FakeDataChannel, answererCh: FakeDataChannel) => {
  offererCh.send = (data: string) => queueMicrotask(() => answererCh.onmessage?.({data}))
  answererCh.send = (data: string) => queueMicrotask(() => offererCh.onmessage?.({data}))
  offererCh.close = () => {
    const h = offererCh.onclose
    offererCh.onclose = null
    offererCh.send = () => {}
    h?.()
    queueMicrotask(() => {
      const h2 = answererCh.onclose
      answererCh.onclose = null
      answererCh.send = () => {}
      h2?.()
    })
  }
  answererCh.close = () => {
    const h = answererCh.onclose
    answererCh.onclose = null
    answererCh.send = () => {}
    h?.()
    queueMicrotask(() => {
      const h2 = offererCh.onclose
      offererCh.onclose = null
      offererCh.send = () => {}
      h2?.()
    })
  }
}

export const createFakePeerConnectionFactory = () => {
  // Maps SDP string → channels registered at setLocalDescription time
  const sdpRegistry = new Map<string, FakeDataChannel[]>()
  // Maps offer SDP → paired channels (set when answerer processes offer)
  const channelPairs = new Map<string, ChannelPair[]>()

  const createPeerConnection = (): RTCPeerConnection => {
    const id = crypto.randomUUID()
    const offerSdp = `fake-offer-${id}`
    const answerSdp = `fake-answer-${id}`
    const localChannels: FakeDataChannel[] = []
    const inboundChannels: FakeDataChannel[] = []
    let closed = false

    const pc = {
      iceGatheringState: 'new' as string,
      localDescription: null as {sdp: string} | null,
      onicecandidate: null as ((event: {candidate: null}) => void) | null,
      ondatachannel: null as ((event: {channel: unknown}) => void) | null,

      createDataChannel: (): FakeDataChannel => {
        const ch = createUnpairedChannel()
        localChannels.push(ch)
        return ch
      },

      createOffer: async () => ({type: 'offer' as const, sdp: offerSdp}),
      createAnswer: async () => ({type: 'answer' as const, sdp: answerSdp}),

      setLocalDescription: async (desc: {type: string; sdp: string}) => {
        pc.localDescription = {sdp: desc.sdp}
        pc.iceGatheringState = 'complete'
        sdpRegistry.set(desc.sdp, localChannels)
        queueMicrotask(() => pc.onicecandidate?.({candidate: null}))
      },

      setRemoteDescription: async (desc: {type: string; sdp: string}) => {
        if (desc.type === 'offer') {
          const offererChannels = sdpRegistry.get(desc.sdp)
          if (!offererChannels) return
          const pairs: ChannelPair[] = []
          for (const offererChannel of offererChannels) {
            const answererChannel = createUnpairedChannel()
            pairChannels(offererChannel, answererChannel)
            pairs.push({offererChannel, answererChannel})
            inboundChannels.push(answererChannel)
            queueMicrotask(() => pc.ondatachannel?.({channel: answererChannel}))
          }
          channelPairs.set(desc.sdp, pairs)
        } else if (desc.type === 'answer') {
          const offerSdpKey = pc.localDescription?.sdp
          if (!offerSdpKey) return
          const pairs = channelPairs.get(offerSdpKey)
          if (!pairs) return
          for (const {offererChannel, answererChannel} of pairs) {
            queueMicrotask(() => offererChannel.onopen?.())
            queueMicrotask(() => answererChannel.onopen?.())
          }
        }
      },

      close: () => {
        if (closed) return
        closed = true
        for (const ch of localChannels) ch.close()
        for (const ch of inboundChannels) ch.close()
      },
    }

    return pc as unknown as RTCPeerConnection
  }

  // Returns the answerer-side channel for a given offer SDP, allowing tests
  // to call onmessage directly (simulate inbound data) or send (route to offerer)
  const getAnswererChannel = (offerSdp: string): FakeDataChannel | undefined =>
    channelPairs.get(offerSdp)?.[0]?.answererChannel

  return {createPeerConnection, getAnswererChannel}
}
