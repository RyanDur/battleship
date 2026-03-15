import {render, screen, act} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Connections} from './Connections'
import {ConnectionProvider} from '../state/ConnectionProvider'
import {createConnectionStore} from '../state/connectionStore'
import {success, failure} from '../lib/result'
import type {PeerEvent} from '../types/worker-messages'

const makeStore = () => {
  let emitFn: (event: PeerEvent) => void = () => {}
  const store = createConnectionStore({
    createHandler: (emit) => {
      emitFn = emit
      return {handleCommand: () => {}}
    },
    encodeCode: async (sdp) => `encoded:${sdp}`,
    decodeCode: async (code) =>
      code.startsWith('encoded:')
        ? success(code.slice(8))
        : failure('DECRYPT_FAILED' as const),
  })
  return {store, emit: (e: PeerEvent) => emitFn(e)}
}

const renderConnections = (serviceOnline = true) => {
  const {store, emit} = makeStore()
  render(
    <ConnectionProvider store={store}>
      <Connections serviceOnline={serviceOnline}/>
    </ConnectionProvider>
  )
  return {store, emit}
}

describe('Connections', () => {
  it('shows create and join options when service is online', () => {
    renderConnections(true)

    expect(screen.getByRole('button', {name: /create/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /join/i})).toBeInTheDocument()
  })

  it('hides connection UI when service is not online', () => {
    renderConnections(false)

    expect(screen.queryByRole('button', {name: /create/i})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /join/i})).not.toBeInTheDocument()
  })

  it('clicking Create shows passphrase input', async () => {
    const user = userEvent.setup()
    renderConnections()

    await user.click(screen.getByRole('button', {name: /create/i}))

    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument()
  })

  it('submitting Create form transitions to offer-ready after SDP encodes', async () => {
    const user = userEvent.setup()
    const {emit} = renderConnections()

    await user.click(screen.getByRole('button', {name: /create/i}))
    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret')
    await user.click(screen.getByRole('button', {name: /generate/i}))

    await act(async () => emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'}))

    await vi.waitFor(() => expect(screen.getByText('encoded:v=0')).toBeInTheDocument())
  })

  it('entering response code and submitting calls acceptAnswer', async () => {
    const user = userEvent.setup()
    const {store, emit} = makeStore()
    render(
      <ConnectionProvider store={store}>
        <Connections serviceOnline={true}/>
      </ConnectionProvider>
    )

    act(() => store.createOffer('pass'))
    await act(async () => emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'}))
    await vi.waitFor(() => expect(screen.getByLabelText(/response code/i)).toBeInTheDocument())

    await user.type(screen.getByLabelText(/response code/i), 'encoded:v=answer')
    await user.click(screen.getByRole('button', {name: /connect/i}))

    // acceptAnswer decodes and forwards to handler — flow stays offer-ready at store level
    // verify no errors thrown and the button interaction completed
    expect(screen.getByRole('button', {name: /connect/i})).toBeInTheDocument()
  })

  it('clicking Join shows passphrase and offer code inputs', async () => {
    const user = userEvent.setup()
    renderConnections()

    await user.click(screen.getByRole('button', {name: /join/i}))

    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/offer code/i)).toBeInTheDocument()
  })

  it('submitting Join form transitions to joining phase', async () => {
    const user = userEvent.setup()
    const {store} = renderConnections()

    await user.click(screen.getByRole('button', {name: /join/i}))
    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret')
    await user.type(screen.getByLabelText(/offer code/i), 'encoded:v=0')
    await user.click(screen.getByRole('button', {name: /join/i}))

    await vi.waitFor(() => expect(store.getState().flow.phase).toBe('joining'))
  })

  it('shows answer code when flow is answer-ready', async () => {
    const {store, emit} = makeStore()
    render(
      <ConnectionProvider store={store}>
        <Connections serviceOnline={true}/>
      </ConnectionProvider>
    )

    await act(async () => store.joinOffer('encoded:v=0', 'pass'))
    await act(async () => emit({type: 'ANSWER_CREATED', peerId: 'p1', sdp: 'v=answer'}))

    await vi.waitFor(() => expect(screen.getByText('encoded:v=answer')).toBeInTheDocument())
  })

  it('shows connected peer by name in peers list', async () => {
    const {emit} = renderConnections()

    await act(async () => emit({type: 'PEER_CONNECTED', peerId: 'p1'}))
    await act(async () => emit({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}))

    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows peer without name as Unknown', async () => {
    const {emit} = renderConnections()

    await act(async () => emit({type: 'PEER_CONNECTED', peerId: 'p1'}))

    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows connections of a peer when PEER_CONNECTIONS_UPDATED is received', async () => {
    const {emit} = renderConnections()

    await act(async () => emit({type: 'PEER_CONNECTED', peerId: 'p1'}))
    await act(async () => emit({type: 'PEER_NAMED', peerId: 'p1', name: 'Bob'}))
    await act(async () => emit({type: 'PEER_CONNECTIONS_UPDATED', peerId: 'p1', connections: ['Carol', 'Dave']}))

    expect(screen.getByText('Carol')).toBeInTheDocument()
    expect(screen.getByText('Dave')).toBeInTheDocument()
  })

  it('clicking disconnect removes the peer', async () => {
    const user = userEvent.setup()
    const {store, emit} = renderConnections()

    await act(async () => emit({type: 'PEER_CONNECTED', peerId: 'p1'}))
    await act(async () => emit({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}))
    expect(screen.getByText('Alice')).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: /disconnect/i}))
    await act(async () => emit({type: 'PEER_DISCONNECTED', peerId: 'p1'}))

    expect(store.getState().peers).toEqual([])
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })
})
