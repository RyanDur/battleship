import {startHeartbeat} from './heartbeat'
import type {HeartbeatConfig, HeartbeatState} from './heartbeat'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.onopen?.(new Event('open'))
  }

  receive(data: object) {
    this.onmessage?.(new MessageEvent('message', {data: JSON.stringify(data)}))
  }

  close() {
    this.onclose?.(new CloseEvent('close'))
  }
}

const latest = (): FakeWebSocket =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1]

const makeConfig = (overrides: Partial<HeartbeatConfig> = {}): HeartbeatConfig => {
  return {
    createWebSocket: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    url: 'ws://localhost:8080/ws/health',
    expectedVersion: '1.0.0',
    heartbeatTimeout: 10_000,
    maxRetries: 3,
    ...overrides,
  }
}

describe('startHeartbeat', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in connecting state', () => {
    const states: HeartbeatState[] = []
    startHeartbeat(makeConfig(), s => states.push(s))

    expect(states).toEqual([{status: 'connecting'}])
  })

  it('transitions to online when heartbeat version matches', () => {
    const states: HeartbeatState[] = []
    startHeartbeat(makeConfig(), s => states.push(s))

    latest().open()
    latest().receive({type: 'heartbeat', version: '1.0.0'})

    expect(states).toContainEqual({status: 'online'})
  })

  it('transitions to update-available when heartbeat version does not match', () => {
    const states: HeartbeatState[] = []
    startHeartbeat(makeConfig({expectedVersion: '2.0.0'}), s => states.push(s))

    latest().open()
    latest().receive({type: 'heartbeat', version: '1.0.0'})

    expect(states).toContainEqual({status: 'update-available'})
  })

  it('stays online in dev mode regardless of backend version', () => {
    const states: HeartbeatState[] = []
    startHeartbeat(makeConfig({expectedVersion: 'dev'}), s => states.push(s))

    latest().open()
    latest().receive({type: 'heartbeat', version: '9.9.9'})

    expect(states).toContainEqual({status: 'online'})
    expect(states).not.toContainEqual({status: 'update-available'})
  })

  it('resets attempt counter to zero after a successful heartbeat', () => {
    const states: HeartbeatState[] = []
    startHeartbeat(makeConfig({maxRetries: 3}), s => states.push(s))

    // First connection — open and receive heartbeat
    latest().open()
    latest().receive({type: 'heartbeat', version: '1.0.0'})

    // Timeout fires — closes WS
    vi.advanceTimersByTime(10_001)
    vi.advanceTimersByTime(1_001) // reconnect delay

    const ws2 = latest()
    ws2.open()
    ws2.receive({type: 'heartbeat', version: '1.0.0'})

    // Should be online, not reconnecting with a high attempt count
    const lastState = states[states.length - 1]
    expect(lastState).toEqual({status: 'online'})
  })

  it('ignores non-heartbeat messages', () => {
    const states: HeartbeatState[] = []
    startHeartbeat(makeConfig(), s => states.push(s))

    latest().open()
    latest().receive({type: 'other', data: 'something'})

    expect(states).not.toContainEqual({status: 'online'})
    expect(states).not.toContainEqual({status: 'update-available'})
  })

  it('transitions to reconnecting when heartbeat timeout fires', () => {
    const states: HeartbeatState[] = []
    startHeartbeat(makeConfig({maxRetries: 3}), s => states.push(s))

    latest().open()
    vi.advanceTimersByTime(10_001) // timeout fires, closes WS

    expect(states).toContainEqual({status: 'reconnecting', attempt: 1})
  })

  it('transitions to disconnected after maxRetries', () => {
    const states: HeartbeatState[] = []
    startHeartbeat(makeConfig({maxRetries: 2, heartbeatTimeout: 10_000}), s => states.push(s))

    for (let i = 0; i < 3; i++) {
      latest().open()
      vi.advanceTimersByTime(10_001) // timeout → close
      if (i < 2) vi.advanceTimersByTime(1_001) // reconnect delay
    }

    expect(states).toContainEqual({status: 'disconnected'})
  })

  it('stop prevents any further state changes', () => {
    const states: HeartbeatState[] = []
    const handle = startHeartbeat(makeConfig(), s => states.push(s))
    const stateCountAfterStart = states.length

    handle.stop()
    latest().open()
    vi.advanceTimersByTime(20_000)

    expect(states.length).toBe(stateCountAfterStart)
  })

  it('retry resets to connecting and reconnects', () => {
    const states: HeartbeatState[] = []
    const handle = startHeartbeat(makeConfig({maxRetries: 0}), s => states.push(s))

    latest().open()
    vi.advanceTimersByTime(10_001) // timeout → disconnected (maxRetries: 0)

    expect(states).toContainEqual({status: 'disconnected'})

    states.length = 0
    handle.retry()

    expect(states).toContainEqual({status: 'connecting'})
    expect(FakeWebSocket.instances.length).toBe(2)
  })

  it('logs a warning when server sends malformed JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    startHeartbeat(makeConfig(), () => undefined)

    latest().open()
    latest().onmessage?.(new MessageEvent('message', {data: 'not-valid-json'}))

    expect(warn).toHaveBeenCalled()
  })

  it('retry does not trigger reconnect from old connection close', () => {
    const states: HeartbeatState[] = []
    const handle = startHeartbeat(makeConfig({maxRetries: 5}), s => states.push(s))

    handle.retry()

    // Old WS's close (from retry) should not count as a failed attempt
    const reconnectingStates = states.filter(s => s.status === 'reconnecting')
    expect(reconnectingStates).toHaveLength(0)
    expect(states).toContainEqual({status: 'connecting'})
  })
})
