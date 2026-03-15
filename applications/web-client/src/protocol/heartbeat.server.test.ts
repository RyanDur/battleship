// @vitest-environment node
import {WebSocket} from 'ws'
import {startHeartbeat} from './heartbeat'
import type {HeartbeatState} from './heartbeat'
import {createStubServer} from '../test/stubServer'
import type {WsConnection} from '../test/stubServer'

const SHORT_TIMEOUT = 50
const RECONNECT_DELAY = 1_000

const makeWebSocket = (url: string): globalThis.WebSocket =>
  new WebSocket(url) as unknown as globalThis.WebSocket

const startWithServer = async (
  serverSetup: (conn: WsConnection) => void,
  configOverrides: {expectedVersion?: string; maxRetries?: number} = {}
) => {
  let wsConn: WsConnection | undefined
  const server = await createStubServer({
    ws: {'/ws/health': conn => { wsConn = conn; serverSetup(conn) }},
  })
  const states: HeartbeatState[] = []
  const handle = startHeartbeat({
    createWebSocket: makeWebSocket,
    url: server.url.replace('http://', 'ws://') + '/ws/health',
    expectedVersion: configOverrides.expectedVersion ?? '1.0.0',
    heartbeatTimeout: SHORT_TIMEOUT,
    maxRetries: configOverrides.maxRetries ?? 3,
  }, s => states.push(s))

  await vi.waitFor(() => expect(wsConn).toBeDefined())

  const cleanup = async () => { handle.stop(); await server.close() }
  return {states, handle, server, getConn: () => wsConn!, cleanup}
}

describe('startHeartbeat', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in connecting state', async () => {
    let wsConn: WsConnection | undefined
    const server = await createStubServer({
      ws: {'/ws/health': conn => { wsConn = conn }},
    })
    const states: HeartbeatState[] = []
    const handle = startHeartbeat({
      createWebSocket: makeWebSocket,
      url: server.url.replace('http://', 'ws://') + '/ws/health',
      expectedVersion: '1.0.0',
    }, s => states.push(s))

    expect(states).toEqual([{status: 'connecting'}])
    await vi.waitFor(() => expect(wsConn).toBeDefined())
    handle.stop()
    await server.close()
  })

  it('transitions to online when heartbeat version matches', async () => {
    const {states, getConn, cleanup} = await startWithServer(() => undefined)

    getConn().send(JSON.stringify({type: 'heartbeat', version: '1.0.0'}))

    await vi.waitFor(() => expect(states).toContainEqual({status: 'online'}))
    await cleanup()
  })

  it('transitions to update-available when heartbeat version does not match', async () => {
    const {states, getConn, cleanup} = await startWithServer(() => undefined, {expectedVersion: '2.0.0'})

    getConn().send(JSON.stringify({type: 'heartbeat', version: '1.0.0'}))

    await vi.waitFor(() => expect(states).toContainEqual({status: 'update-available'}))
    await cleanup()
  })

  it('stays online in dev mode regardless of backend version', async () => {
    const {states, getConn, cleanup} = await startWithServer(() => undefined, {expectedVersion: 'dev'})

    getConn().send(JSON.stringify({type: 'heartbeat', version: '9.9.9'}))

    await vi.waitFor(() => expect(states).toContainEqual({status: 'online'}))
    expect(states).not.toContainEqual({status: 'update-available'})
    await cleanup()
  })

  it('ignores non-heartbeat messages', async () => {
    const {states, getConn, cleanup} = await startWithServer(() => undefined)

    getConn().send(JSON.stringify({type: 'other', data: 'something'}))

    await new Promise(r => setTimeout(r, 100))
    expect(states).not.toContainEqual({status: 'online'})
    expect(states).not.toContainEqual({status: 'update-available'})
    await cleanup()
  })

  it('logs a warning when server sends malformed JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const {getConn, cleanup} = await startWithServer(() => undefined)

    getConn().send('not-valid-json')

    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    await cleanup()
  })

  it('transitions to reconnecting when heartbeat timeout fires', async () => {
    const {states, cleanup} = await startWithServer(() => undefined)

    // Don't send a heartbeat — timeout fires and triggers reconnect
    await vi.waitFor(() => expect(states).toContainEqual({status: 'reconnecting', attempt: 1}), {timeout: 2000})
    await cleanup()
  })

  it('resets attempt counter to zero after a successful heartbeat', async () => {
    let connectionCount = 0
    let latestConn: WsConnection | undefined
    const server = await createStubServer({
      ws: {'/ws/health': conn => { connectionCount++; latestConn = conn }},
    })
    const states: HeartbeatState[] = []
    const handle = startHeartbeat({
      createWebSocket: makeWebSocket,
      url: server.url.replace('http://', 'ws://') + '/ws/health',
      expectedVersion: '1.0.0',
      heartbeatTimeout: SHORT_TIMEOUT,
      maxRetries: 3,
    }, s => states.push(s))

    // First connection — receive heartbeat
    await vi.waitFor(() => expect(connectionCount).toBe(1))
    latestConn!.send(JSON.stringify({type: 'heartbeat', version: '1.0.0'}))
    await vi.waitFor(() => expect(states).toContainEqual({status: 'online'}))

    // Timeout fires, reconnect
    await vi.waitFor(() => expect(connectionCount).toBe(2), {timeout: RECONNECT_DELAY + 500})
    latestConn!.send(JSON.stringify({type: 'heartbeat', version: '1.0.0'}))

    await vi.waitFor(() => {
      const lastState = states[states.length - 1]
      expect(lastState).toEqual({status: 'online'})
    })
    handle.stop()
    await server.close()
  })

  it('transitions to disconnected after maxRetries', async () => {
    const {states, cleanup} = await startWithServer(() => undefined, {maxRetries: 2})

    await vi.waitFor(() => expect(states).toContainEqual({status: 'disconnected'}), {timeout: (RECONNECT_DELAY + SHORT_TIMEOUT) * 4})
    await cleanup()
  })

  it('stop prevents any further state changes', async () => {
    const {states, handle, server} = await startWithServer(() => undefined)
    const stateCountAfterStart = states.length

    handle.stop()
    await new Promise(r => setTimeout(r, SHORT_TIMEOUT + 200))

    expect(states.length).toBe(stateCountAfterStart)
    await server.close()
  })

  it('retry resets to connecting and reconnects', async () => {
    const {states, handle, cleanup} = await startWithServer(() => undefined, {maxRetries: 0})

    await vi.waitFor(() => expect(states).toContainEqual({status: 'disconnected'}), {timeout: 2000})

    states.length = 0
    handle.retry()

    await vi.waitFor(() => expect(states).toContainEqual({status: 'connecting'}))
    await cleanup()
  })

  it('retry does not trigger reconnect from old connection close', async () => {
    const {states, handle, cleanup} = await startWithServer(() => undefined, {maxRetries: 5})

    handle.retry()
    // Stop immediately so the new connection's timeout doesn't trigger reconnects.
    // We only care that the old connection's close (from retry) isn't counted.
    handle.stop()

    const reconnectingStates = states.filter(s => s.status === 'reconnecting')
    expect(reconnectingStates).toHaveLength(0)
    expect(states).toContainEqual({status: 'connecting'})
    await cleanup()
  })
})
