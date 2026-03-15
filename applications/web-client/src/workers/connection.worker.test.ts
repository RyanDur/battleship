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

  describe('trust', () => {
    it('GRANT_TRUST sends { type: TRUST, granted: true } to the matching peer channel', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))
      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()
      handleCommand({ type: 'GRANT_TRUST', peerId })

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'TRUST', granted: true }))
    })

    it('REVOKE_TRUST sends { type: TRUST, granted: false } to the matching peer channel', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))
      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()
      handleCommand({ type: 'REVOKE_TRUST', peerId })

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'TRUST', granted: false }))
    })

    it('emits PEER_TRUST_UPDATED with trusts: true when peer sends TRUST granted message', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))
      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'TRUST', granted: true }) })

      expect(events).toContainEqual({ type: 'PEER_TRUST_UPDATED', peerId, trusts: true })
    })

    it('emits PEER_TRUST_UPDATED with trusts: false when peer sends TRUST revoked message', async () => {
      const { handleCommand } = await createHandler('Alice')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))
      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'TRUST', granted: false }) })

      expect(events).toContainEqual({ type: 'PEER_TRUST_UPDATED', peerId, trusts: false })
    })
  })

  describe('introductions — introducer side', () => {
    const setupTwoPeers = async (handler: Awaited<ReturnType<typeof createHandler>>) => {
      const { handleCommand } = handler

      handleCommand({ type: 'CREATE_OFFER' })
      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Bob' }) })

      handleCommand({ type: 'CREATE_OFFER' })
      channels[1].onopen?.()
      channels[1].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCE', name: 'Carol' }) })

      completeIceGathering(pcs[0], 'bob-sdp')
      completeIceGathering(pcs[1], 'carol-sdp')
      await vi.waitFor(() => expect(events.filter(e => e.type === 'OFFER_CREATED')).toHaveLength(2))

      const bobPeerId = (events.find(e => e.type === 'PEER_CONNECTED' && channels.indexOf(channels[0]) === 0) as { peerId: string }).peerId
      const carolPeerId = (events.filter(e => e.type === 'PEER_CONNECTED')[1] as { peerId: string }).peerId
      return { bobPeerId, carolPeerId }
    }

    it('INTRODUCE_PEERS sends INTRODUCTION to both peer channels', async () => {
      const handler = await createHandler('Alice')
      const { handleCommand } = handler
      const { bobPeerId, carolPeerId } = await setupTwoPeers(handler)

      handleCommand({ type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId })

      expect(channels[0].send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"INTRODUCTION"')
      )
      expect(channels[1].send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"INTRODUCTION"')
      )
    })

    it('INTRODUCTION to Bob includes Carol as the peer and vice versa', async () => {
      const handler = await createHandler('Alice')
      const { handleCommand } = handler
      const { bobPeerId, carolPeerId } = await setupTwoPeers(handler)

      handleCommand({ type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId })

      const bobMsg = JSON.parse(channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'INTRODUCTION')![0])
      const carolMsg = JSON.parse(channels[1].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'INTRODUCTION')![0])

      expect(bobMsg.peer).toBe('Carol')
      expect(carolMsg.peer).toBe('Bob')
      expect(bobMsg.from).toBe('Alice')
      expect(carolMsg.from).toBe('Alice')
    })

    it('when both accept, sends CREATE_OFFER_FOR to the first peer', async () => {
      const handler = await createHandler('Alice')
      const { handleCommand } = handler
      const { bobPeerId, carolPeerId } = await setupTwoPeers(handler)

      handleCommand({ type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId })

      const introId = JSON.parse(channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'INTRODUCTION')![0]).introId

      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId, accepted: true }) })
      channels[1].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId, accepted: true }) })

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'CREATE_OFFER_FOR', introId }))
    })

    it('when only one accepts and timer fires, sends INTRODUCTION_EXPIRED to both', async () => {
      vi.useFakeTimers()
      const handler = await createHandler('Alice')
      const { handleCommand } = handler
      const { bobPeerId, carolPeerId } = await setupTwoPeers(handler)

      handleCommand({ type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId })

      const introId = JSON.parse(channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'INTRODUCTION')![0]).introId
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId, accepted: true }) })

      vi.advanceTimersByTime(60000)

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId }))
      expect(channels[1].send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId }))
      vi.useRealTimers()
    })

    it('when one declines, sends INTRODUCTION_DECLINED to the other', async () => {
      const handler = await createHandler('Alice')
      const { handleCommand } = handler
      const { bobPeerId, carolPeerId } = await setupTwoPeers(handler)

      handleCommand({ type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId })

      const introId = JSON.parse(channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'INTRODUCTION')![0]).introId
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId, accepted: false }) })

      expect(channels[1].send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCTION_DECLINED', introId }))
    })

    it('relays RELAY_SDP from peerId1 to peerId2 as INTRODUCTION_SDP', async () => {
      const handler = await createHandler('Alice')
      const { handleCommand } = handler
      const { bobPeerId, carolPeerId } = await setupTwoPeers(handler)

      handleCommand({ type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId })

      const introId = JSON.parse(channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'INTRODUCTION')![0]).introId
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId, accepted: true }) })
      channels[1].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId, accepted: true }) })

      channels[0].onmessage?.({ data: JSON.stringify({ type: 'RELAY_SDP', introId, peerId: 'bob-local-id', sdp: 'bob-offer-sdp' }) })

      expect(channels[1].send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCTION_SDP', introId, sdp: 'bob-offer-sdp' }))
    })

    it('relays RELAY_SDP_ANSWER from peerId2 back to peerId1 as INTRODUCTION_SDP_ANSWER', async () => {
      const handler = await createHandler('Alice')
      const { handleCommand } = handler
      const { bobPeerId, carolPeerId } = await setupTwoPeers(handler)

      handleCommand({ type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId })

      const introId = JSON.parse(channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'INTRODUCTION')![0]).introId
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId, accepted: true }) })
      channels[1].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId, accepted: true }) })
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'RELAY_SDP', introId, peerId: 'bob-local-id', sdp: 'bob-offer-sdp' }) })

      channels[1].onmessage?.({ data: JSON.stringify({ type: 'RELAY_SDP_ANSWER', introId, sdp: 'carol-answer-sdp' }) })

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCTION_SDP_ANSWER', introId, peerId: 'bob-local-id', sdp: 'carol-answer-sdp' }))
    })
  })

  describe('introductions — introduced party side', () => {
    it('emits INTRODUCTION_RECEIVED when peer sends INTRODUCTION message', async () => {
      const { handleCommand } = await createHandler('Bob')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))
      const peerId = (events.find(e => e.type === 'OFFER_CREATED') as { peerId: string }).peerId

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION', introId: 'i1', from: 'Alice', peer: 'Carol' }) })

      expect(events).toContainEqual({ type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol' })
      void peerId
    })

    it('ACCEPT_INTRODUCTION sends INTRODUCTION_RESPONSE accepted: true to the introducing peer', async () => {
      const { handleCommand } = await createHandler('Bob')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION', introId: 'i1', from: 'Alice', peer: 'Carol' }) })

      handleCommand({ type: 'ACCEPT_INTRODUCTION', introId: 'i1' })

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId: 'i1', accepted: true }))
    })

    it('DECLINE_INTRODUCTION sends INTRODUCTION_RESPONSE accepted: false to the introducing peer', async () => {
      const { handleCommand } = await createHandler('Bob')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION', introId: 'i1', from: 'Alice', peer: 'Carol' }) })

      handleCommand({ type: 'DECLINE_INTRODUCTION', introId: 'i1' })

      expect(channels[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId: 'i1', accepted: false }))
    })

    it('creates and relays SDP offer when receiving CREATE_OFFER_FOR', async () => {
      const { handleCommand } = await createHandler('Bob')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'alice-offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION', introId: 'i1', from: 'Alice', peer: 'Carol' }) })
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'CREATE_OFFER_FOR', introId: 'i1' }) })

      // Complete ICE gathering for the new connection to Carol
      completeIceGathering(pcs[1], 'bob-carol-offer-sdp')

      await vi.waitFor(() => {
        const relayCalls = channels[0].send.mock.calls.filter((c: string[]) => {
          try { return JSON.parse(c[0]).type === 'RELAY_SDP' } catch { return false }
        })
        expect(relayCalls.length).toBeGreaterThan(0)
      })

      const relayCall = channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'RELAY_SDP')!
      const msg = JSON.parse(relayCall[0])
      expect(msg.type).toBe('RELAY_SDP')
      expect(msg.introId).toBe('i1')
      expect(msg.sdp).toBe('bob-carol-offer-sdp')
      expect(msg.peerId).toBeDefined()
    })

    it('sets remote description when receiving INTRODUCTION_SDP_ANSWER', async () => {
      const { handleCommand } = await createHandler('Bob')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'alice-offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION', introId: 'i1', from: 'Alice', peer: 'Carol' }) })
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'CREATE_OFFER_FOR', introId: 'i1' }) })

      completeIceGathering(pcs[1], 'bob-carol-offer-sdp')

      await vi.waitFor(() => {
        expect(channels[0].send.mock.calls.some((c: string[]) => {
          try { return JSON.parse(c[0]).type === 'RELAY_SDP' } catch { return false }
        })).toBe(true)
      })

      const relayMsg = JSON.parse(channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'RELAY_SDP')![0])

      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_SDP_ANSWER', introId: 'i1', peerId: relayMsg.peerId, sdp: 'carol-answer-sdp' }) })

      expect(pcs[1].setRemoteDescription).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'answer', sdp: 'carol-answer-sdp' })
      )
    })

    it('emits INTRODUCTION_DECLINED when peer sends INTRODUCTION_DECLINED', async () => {
      const { handleCommand } = await createHandler('Bob')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION', introId: 'i1', from: 'Alice', peer: 'Carol' }) })
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_DECLINED', introId: 'i1' }) })

      expect(events).toContainEqual({ type: 'INTRODUCTION_DECLINED', introId: 'i1' })
    })

    it('emits INTRODUCTION_EXPIRED when peer sends INTRODUCTION_EXPIRED', async () => {
      const { handleCommand } = await createHandler('Bob')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION', introId: 'i1', from: 'Alice', peer: 'Carol' }) })
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId: 'i1' }) })

      expect(events).toContainEqual({ type: 'INTRODUCTION_EXPIRED', introId: 'i1' })
    })

    it('answerer creates connection and relays answer SDP when receiving INTRODUCTION_SDP', async () => {
      const { handleCommand } = await createHandler('Carol')
      handleCommand({ type: 'CREATE_OFFER' })
      completeIceGathering(pcs[0], 'alice-offer-sdp')

      await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_CREATED' })))

      channels[0].onopen?.()
      channels[0].onmessage?.({ data: JSON.stringify({ type: 'INTRODUCTION_SDP', introId: 'i1', sdp: 'bob-offer-sdp' }) })

      completeIceGathering(pcs[1], 'carol-bob-answer-sdp')

      await vi.waitFor(() => {
        expect(channels[0].send.mock.calls.some((c: string[]) => {
          try { return JSON.parse(c[0]).type === 'RELAY_SDP_ANSWER' } catch { return false }
        })).toBe(true)
      })

      const answerMsg = JSON.parse(channels[0].send.mock.calls.find((c: string[]) => JSON.parse(c[0]).type === 'RELAY_SDP_ANSWER')![0])
      expect(answerMsg.introId).toBe('i1')
      expect(answerMsg.sdp).toBe('carol-bob-answer-sdp')
    })
  })
})
