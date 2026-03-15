import type { PeerEvent } from '../types/worker-messages'

// Story #41: Support multiple simultaneous peer connections

type MockPc = {
  createOffer: ReturnType<typeof vi.fn>
  createAnswer: ReturnType<typeof vi.fn>
  setLocalDescription: ReturnType<typeof vi.fn>
  setRemoteDescription: ReturnType<typeof vi.fn>
  onicecandidate: ((event: { candidate: unknown }) => void) | null
  ondatachannel: ((event: { channel: unknown }) => void) | null
  createDataChannel: ReturnType<typeof vi.fn>
  iceGatheringState: string
  localDescription: { sdp: string } | null
  close: ReturnType<typeof vi.fn>
}

type MockChannel = {
  onopen: (() => void) | null
  onclose: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  send: ReturnType<typeof vi.fn>
}

describe('Peer Handler', () => {
  let events: PeerEvent[]
  let pcs: MockPc[]
  let channels: MockChannel[]

  const makeMockChannel = (): MockChannel => ({
    onopen: null,
    onclose: null,
    onmessage: null,
    send: vi.fn(),
  })

  const makeMockPc = (): MockPc => {
    const channel = makeMockChannel()
    channels.push(channel)
    return {
      createOffer: vi.fn().mockResolvedValue({ sdp: 'mock-offer-sdp', type: 'offer' }),
      createAnswer: vi.fn().mockResolvedValue({ sdp: 'mock-answer-sdp', type: 'answer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      onicecandidate: null,
      ondatachannel: null,
      createDataChannel: vi.fn().mockReturnValue(channel),
      iceGatheringState: 'new',
      localDescription: null,
      close: vi.fn(),
    }
  }

  beforeEach(() => {
    events = []
    pcs = []
    channels = []
  })

  const createHandler = async (name = 'Alice') => {
    const { createPeerHandler } = await import('./connection.handler')
    return createPeerHandler({
      name,
      emit: (event) => events.push(event),
      createPeerConnection: () => {
        const pc = makeMockPc()
        pcs.push(pc)
        return pc as unknown as RTCPeerConnection
      },
    })
  }

  const completeIceGathering = (pc: MockPc, sdp: string) => {
    pc.iceGatheringState = 'complete'
    pc.localDescription = { sdp }
    pc.onicecandidate?.({ candidate: null })
  }

  describe('creating an offer', () => {
    it('emits OFFER_CREATED with a peerId and full SDP when ICE gathering completes', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'full-offer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(
          expect.objectContaining({ type: 'OFFER_CREATED', sdp: 'full-offer-sdp' })
        )
      })
      expect(events[0]).toHaveProperty('peerId')
      expect(typeof (events[0] as { peerId: string }).peerId).toBe('string')
    })

    it('creates a "game" data channel', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      expect(pcs[0].createDataChannel).toHaveBeenCalledWith('game')
    })

    it('each offer gets a unique peer ID', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'sdp-1')
      completeIceGathering(pcs[1], 'sdp-2')

      await vi.waitFor(() => {
        expect(events.filter(e => e.type === 'OFFER_CREATED')).toHaveLength(2)
      })

      const [first, second] = events.filter(e => e.type === 'OFFER_CREATED') as Array<{ peerId: string }>
      expect(first.peerId).not.toBe(second.peerId)
    })

    it('creating a second offer does not affect the first connection', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })
      handleCommand({ type: 'CREATE_OFFER' })

      expect(pcs).toHaveLength(2)
      expect(pcs[0].close).not.toHaveBeenCalled()
    })
  })

  describe('accepting an offer', () => {
    it('emits ANSWER_CREATED with a peerId and full SDP when ICE gathering completes', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'ACCEPT_OFFER', sdp: 'remote-offer-sdp' })

      expect(pcs[0].setRemoteDescription).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'offer', sdp: 'remote-offer-sdp' })
      )

      completeIceGathering(pcs[0], 'full-answer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(
          expect.objectContaining({ type: 'ANSWER_CREATED', sdp: 'full-answer-sdp' })
        )
      })
      expect(events[0]).toHaveProperty('peerId')
    })
  })

  describe('accepting an answer', () => {
    it('sets remote description on the correct peer connection', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'sdp-1')
      completeIceGathering(pcs[1], 'sdp-2')

      await vi.waitFor(() => {
        expect(events.filter(e => e.type === 'OFFER_CREATED')).toHaveLength(2)
      })

      const firstPeerId = (events.find(e => e.type === 'OFFER_CREATED' && (e as { sdp: string }).sdp === 'sdp-1') as { peerId: string }).peerId

      handleCommand({ type: 'ACCEPT_ANSWER', peerId: firstPeerId, sdp: 'remote-answer' })

      expect(pcs[0].setRemoteDescription).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'answer', sdp: 'remote-answer' })
      )
      expect(pcs[1].setRemoteDescription).not.toHaveBeenCalled()
    })
  })

  describe('disconnect', () => {
    it('closes only the specified peer connection', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'sdp-1')
      completeIceGathering(pcs[1], 'sdp-2')

      await vi.waitFor(() => {
        expect(events.filter(e => e.type === 'OFFER_CREATED')).toHaveLength(2)
      })

      const firstPeerId = (events.find(e => e.type === 'OFFER_CREATED' && (e as { sdp: string }).sdp === 'sdp-1') as { peerId: string }).peerId

      handleCommand({ type: 'DISCONNECT', peerId: firstPeerId })

      expect(pcs[0].close).toHaveBeenCalled()
      expect(pcs[1].close).not.toHaveBeenCalled()
    })
  })

  describe('data channel lifecycle', () => {
    it('emits PEER_CONNECTED with peerId when offerer data channel opens', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' }))
      })

      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()

      expect(events).toContainEqual({ type: 'PEER_CONNECTED', peerId })
    })

    it('emits PEER_CONNECTED with peerId when answerer data channel opens', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'ACCEPT_OFFER', sdp: 'remote-offer-sdp' })

      completeIceGathering(pcs[0], 'answer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'ANSWER_CREATED' }))
      })

      const peerId = (events.find(e => e.type === 'ANSWER_CREATED') as { peerId: string }).peerId
      const inboundChannel = makeMockChannel()

      pcs[0].ondatachannel?.({ channel: inboundChannel })
      inboundChannel.onopen?.()

      expect(events).toContainEqual({ type: 'PEER_CONNECTED', peerId })
    })

    it('emits PEER_DISCONNECTED with peerId when data channel closes', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' }))
      })

      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()
      channels[0].onclose?.()

      expect(events).toContainEqual({ type: 'PEER_DISCONNECTED', peerId })
    })

    it('closes peer connection when data channel closes naturally', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      channels[0].onopen?.()
      channels[0].onclose?.()

      expect(pcs[0].close).toHaveBeenCalled()
    })
  })

  describe('name exchange', () => {
    it('sends local name to peer when data channel opens', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' }))
      })

      channels[0].onopen?.()

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCE', name: 'Alice' }))
    })

    it('emits PEER_NAMED with peerId and name when peer sends their name', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' }))
      })

      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Bob' }) })

      expect(events).toContainEqual({ type: 'PEER_NAMED', peerId, name: 'Bob' })
    })

    it('answerer sends local name when inbound data channel opens', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'ACCEPT_OFFER', sdp: 'remote-offer-sdp' })

      completeIceGathering(pcs[0], 'answer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'ANSWER_CREATED' }))
      })

      const inboundChannel = makeMockChannel()
      pcs[0].ondatachannel?.({ channel: inboundChannel })
      inboundChannel.onopen?.()

      expect(inboundChannel.send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCE', name: 'Alice' }))
    })

    it('answerer emits PEER_NAMED when remote peer introduces themselves', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'ACCEPT_OFFER', sdp: 'remote-offer-sdp' })

      completeIceGathering(pcs[0], 'answer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'ANSWER_CREATED' }))
      })

      const peerId = (events.find(e => e.type === 'ANSWER_CREATED') as { peerId: string }).peerId
      const inboundChannel = makeMockChannel()

      pcs[0].ondatachannel?.({ channel: inboundChannel })
      inboundChannel.onopen?.()
      inboundChannel.onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Bob' }) })

      expect(events).toContainEqual({ type: 'PEER_NAMED', peerId, name: 'Bob' })
    })

    it('logs a warning when peer sends malformed JSON', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'CREATE_OFFER' })

      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' }))
      })

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: 'not-valid-json' })

      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('connections broadcasting', () => {
    it('sends current peer names to newly introduced peer', async () => {
      const { handleCommand } = await createHandler('Alice')

      handleCommand({ type: 'CREATE_OFFER' })
      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Bob' }) })

      handleCommand({ type: 'CREATE_OFFER' })
      channels[1].onopen?.()
      channels[1].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Carol' }) })

      expect(channels[1].send).toHaveBeenCalledWith(JSON.stringify({ type: 'CONNECTIONS', names: ['Bob'] }))
    })

    it('broadcasts updated connections to existing peers when new peer introduces', async () => {
      const { handleCommand } = await createHandler('Alice')

      handleCommand({ type: 'CREATE_OFFER' })
      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Bob' }) })

      handleCommand({ type: 'CREATE_OFFER' })
      channels[1].onopen?.()
      channels[1].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Carol' }) })

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'CONNECTIONS', names: ['Carol'] }))
    })

    it('broadcasts updated connections when a peer disconnects', async () => {
      const { handleCommand } = await createHandler('Alice')

      handleCommand({ type: 'CREATE_OFFER' })
      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Bob' }) })

      handleCommand({ type: 'CREATE_OFFER' })
      channels[1].onopen?.()
      channels[1].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Carol' }) })

      channels[1].onclose?.()

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'CONNECTIONS', names: [] }))
    })

    it('emits PEER_CONNECTIONS_UPDATED when peer sends CONNECTIONS message', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))
      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'CONNECTIONS', names: ['Bob', 'Carol'] }) })

      expect(events).toContainEqual({ type: 'PEER_CONNECTIONS_UPDATED', peerId, connections: ['Bob', 'Carol'] })
    })
  })
})
