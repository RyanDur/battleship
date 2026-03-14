import type { WorkerEvent } from '../types/worker-messages'

// Story #6: WebWorker bridges UI to local service via WebSocket
// Story #7: WebWorker establishes WebRTC peer connection

describe('Connection Worker', () => {
  let postedMessages: WorkerEvent[]
  let mockPostMessage: (event: WorkerEvent) => void
  let mockWebSocket: {
    onopen: (() => void) | null
    onclose: ((event: { reason: string }) => void) | null
    onmessage: ((event: { data: string }) => void) | null
    send: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    readyState: number
  }
  let mockRTCPeerConnection: {
    createOffer: ReturnType<typeof vi.fn>
    createAnswer: ReturnType<typeof vi.fn>
    setLocalDescription: ReturnType<typeof vi.fn>
    setRemoteDescription: ReturnType<typeof vi.fn>
    onicecandidate: ((event: { candidate: unknown }) => void) | null
    oniceconnectionstatechange: (() => void) | null
    ondatachannel: ((event: { channel: unknown }) => void) | null
    createDataChannel: ReturnType<typeof vi.fn>
    iceConnectionState: string
    iceGatheringState: string
    localDescription: { sdp: string } | null
    close: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    postedMessages = []
    mockPostMessage = (event: WorkerEvent) => postedMessages.push(event)

    mockWebSocket = {
      onopen: null,
      onclose: null,
      onmessage: null,
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    }

    mockRTCPeerConnection = {
      createOffer: vi.fn().mockResolvedValue({ sdp: 'mock-offer-sdp', type: 'offer' }),
      createAnswer: vi.fn().mockResolvedValue({ sdp: 'mock-answer-sdp', type: 'answer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      onicecandidate: null,
      oniceconnectionstatechange: null,
      ondatachannel: null,
      createDataChannel: vi.fn().mockReturnValue({ onopen: null, onclose: null, onmessage: null, send: vi.fn() }),
      iceConnectionState: 'new',
      iceGatheringState: 'new',
      localDescription: null,
      close: vi.fn(),
    }
  })

  // These tests define the contract that the worker must fulfill.
  // The handleCommand function is the worker's message handler,
  // extracted for testability (not dependent on actual Worker thread).

  describe('Story #6: WebSocket bridge to local service', () => {
    it('posts CONNECTED when WebSocket opens successfully', async () => {
      const { handleCommand } = await createWorker()

      handleCommand({ type: 'CONNECT', token: 'test-token', serviceUrl: 'ws://localhost:8080' })
      mockWebSocket.onopen?.()

      expect(postedMessages).toContainEqual({ type: 'CONNECTED' })
    })

    it('posts DISCONNECTED with reason when WebSocket closes', async () => {
      const { handleCommand } = await createWorker()

      handleCommand({ type: 'CONNECT', token: 'test-token', serviceUrl: 'ws://localhost:8080' })
      mockWebSocket.onopen?.()
      mockWebSocket.onclose?.({ reason: 'server shutdown' })

      expect(postedMessages).toContainEqual({ type: 'DISCONNECTED', reason: 'server shutdown' })
    })

    it('posts DISCONNECTED when DISCONNECT command is received', async () => {
      const { handleCommand } = await createWorker()

      handleCommand({ type: 'CONNECT', token: 'test-token', serviceUrl: 'ws://localhost:8080' })
      mockWebSocket.onopen?.()
      handleCommand({ type: 'DISCONNECT' })

      expect(mockWebSocket.close).toHaveBeenCalled()
    })
  })

  describe('Story #7: WebRTC peer connection', () => {
    it('creates offer and posts OFFER_CREATED with SDP', async () => {
      const { handleCommand } = await createWorker()

      handleCommand({ type: 'CONNECT', token: 'test-token', serviceUrl: 'ws://localhost:8080' })
      mockWebSocket.onopen?.()

      handleCommand({ type: 'CREATE_OFFER' })

      // Simulate ICE gathering complete
      mockRTCPeerConnection.iceGatheringState = 'complete'
      mockRTCPeerConnection.localDescription = { sdp: 'full-offer-sdp' }
      mockRTCPeerConnection.onicecandidate?.({ candidate: null })

      await vi.waitFor(() => {
        expect(postedMessages).toContainEqual(
          expect.objectContaining({ type: 'OFFER_CREATED', sdp: 'full-offer-sdp' })
        )
      })
    })

    it('accepts offer and posts ANSWER_CREATED with SDP', async () => {
      const { handleCommand } = await createWorker()

      handleCommand({ type: 'CONNECT', token: 'test-token', serviceUrl: 'ws://localhost:8080' })
      mockWebSocket.onopen?.()

      handleCommand({ type: 'ACCEPT_OFFER', sdp: 'remote-offer-sdp' })

      expect(mockRTCPeerConnection.setRemoteDescription).toHaveBeenCalled()

      // Simulate ICE gathering complete
      mockRTCPeerConnection.iceGatheringState = 'complete'
      mockRTCPeerConnection.localDescription = { sdp: 'full-answer-sdp' }
      mockRTCPeerConnection.onicecandidate?.({ candidate: null })

      await vi.waitFor(() => {
        expect(postedMessages).toContainEqual(
          expect.objectContaining({ type: 'ANSWER_CREATED', sdp: 'full-answer-sdp' })
        )
      })
    })

    it('accepts answer and posts PEER_CONNECTED when ICE connects', async () => {
      const { handleCommand } = await createWorker()

      handleCommand({ type: 'CONNECT', token: 'test-token', serviceUrl: 'ws://localhost:8080' })
      mockWebSocket.onopen?.()
      handleCommand({ type: 'CREATE_OFFER' })

      // Simulate ICE gathering complete for offer
      mockRTCPeerConnection.iceGatheringState = 'complete'
      mockRTCPeerConnection.localDescription = { sdp: 'full-offer-sdp' }
      mockRTCPeerConnection.onicecandidate?.({ candidate: null })

      handleCommand({ type: 'ACCEPT_ANSWER', sdp: 'remote-answer-sdp' })

      expect(mockRTCPeerConnection.setRemoteDescription).toHaveBeenCalled()

      // Simulate ICE connection established
      mockRTCPeerConnection.iceConnectionState = 'connected'
      mockRTCPeerConnection.oniceconnectionstatechange?.()

      expect(postedMessages).toContainEqual({ type: 'PEER_CONNECTED' })
    })

    it('posts PEER_DISCONNECTED when ICE connection fails', async () => {
      const { handleCommand } = await createWorker()

      handleCommand({ type: 'CONNECT', token: 'test-token', serviceUrl: 'ws://localhost:8080' })
      mockWebSocket.onopen?.()
      handleCommand({ type: 'CREATE_OFFER' })

      mockRTCPeerConnection.iceConnectionState = 'disconnected'
      mockRTCPeerConnection.oniceconnectionstatechange?.()

      expect(postedMessages).toContainEqual({ type: 'PEER_DISCONNECTED' })
    })
  })

  // Factory that wires up the worker logic with mocked dependencies.
  // The actual worker will use real WebSocket and RTCPeerConnection,
  // but the logic (handleCommand) is the same function.
  const createWorker = async () => {
    const { createConnectionHandler } = await import('./connection.handler')

    return createConnectionHandler({
      postMessage: mockPostMessage,
      createWebSocket: () => mockWebSocket as unknown as WebSocket,
      createPeerConnection: () => mockRTCPeerConnection as unknown as RTCPeerConnection,
    })
  }
})
