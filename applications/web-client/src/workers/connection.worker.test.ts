import type { PeerEvent } from '../types/worker-messages'

// Story #38: Direct peer-to-peer connection between players

describe('Peer Handler', () => {
  let events: PeerEvent[]
  let mockChannel: {
    onopen: (() => void) | null
    onclose: (() => void) | null
    onmessage: ((event: { data: string }) => void) | null
    send: ReturnType<typeof vi.fn>
  }
  let mockPc: {
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

  beforeEach(() => {
    events = []

    mockChannel = {
      onopen: null,
      onclose: null,
      onmessage: null,
      send: vi.fn(),
    }

    mockPc = {
      createOffer: vi.fn().mockResolvedValue({ sdp: 'mock-offer-sdp', type: 'offer' }),
      createAnswer: vi.fn().mockResolvedValue({ sdp: 'mock-answer-sdp', type: 'answer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      onicecandidate: null,
      ondatachannel: null,
      createDataChannel: vi.fn().mockReturnValue(mockChannel),
      iceGatheringState: 'new',
      localDescription: null,
      close: vi.fn(),
    }
  })

  const createHandler = async () => {
    const { createPeerHandler } = await import('./connection.handler')
    return createPeerHandler({
      emit: (event) => events.push(event),
      createPeerConnection: () => mockPc as unknown as RTCPeerConnection,
    })
  }

  describe('creating an offer', () => {
    it('emits OFFER_CREATED with full SDP when ICE gathering completes', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      mockPc.iceGatheringState = 'complete'
      mockPc.localDescription = { sdp: 'full-offer-sdp' }
      mockPc.onicecandidate?.({ candidate: null })

      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'OFFER_CREATED', sdp: 'full-offer-sdp' })
      })
    })

    it('creates a "game" data channel', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      expect(mockPc.createDataChannel).toHaveBeenCalledWith('game')
    })
  })

  describe('accepting an offer', () => {
    it('emits ANSWER_CREATED with full SDP when ICE gathering completes', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'ACCEPT_OFFER', sdp: 'remote-offer-sdp' })

      expect(mockPc.setRemoteDescription).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'offer', sdp: 'remote-offer-sdp' })
      )

      mockPc.iceGatheringState = 'complete'
      mockPc.localDescription = { sdp: 'full-answer-sdp' }
      mockPc.onicecandidate?.({ candidate: null })

      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'ANSWER_CREATED', sdp: 'full-answer-sdp' })
      })
    })
  })

  describe('accepting an answer', () => {
    it('sets remote description on the peer connection', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })
      handleCommand({ type: 'ACCEPT_ANSWER', sdp: 'remote-answer-sdp' })

      expect(mockPc.setRemoteDescription).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'answer', sdp: 'remote-answer-sdp' })
      )
    })
  })

  describe('data channel lifecycle', () => {
    it('emits PEER_CONNECTED when offerer data channel opens', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      mockChannel.onopen?.()

      expect(events).toContainEqual({ type: 'PEER_CONNECTED' })
    })

    it('emits PEER_CONNECTED when answerer data channel opens', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'ACCEPT_OFFER', sdp: 'remote-offer-sdp' })

      mockPc.ondatachannel?.({ channel: mockChannel })
      mockChannel.onopen?.()

      expect(events).toContainEqual({ type: 'PEER_CONNECTED' })
    })

    it('emits PEER_DISCONNECTED when data channel closes', async () => {
      const { handleCommand } = await createHandler()
      handleCommand({ type: 'CREATE_OFFER' })

      mockChannel.onopen?.()
      mockChannel.onclose?.()

      expect(events).toContainEqual({ type: 'PEER_DISCONNECTED' })
    })
  })
})
