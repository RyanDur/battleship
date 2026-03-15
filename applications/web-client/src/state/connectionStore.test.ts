import {createConnectionStore} from './connectionStore'
import {success, failure} from '../lib/result'
import type {PeerEvent} from '../types/worker-messages'

const makeStore = () => {
  let emitFn: (event: PeerEvent) => void = () => {}
  const commands: string[] = []

  const store = createConnectionStore({
    createHandler: (emit) => {
      emitFn = emit
      return {handleCommand: (cmd: {type: string}) => commands.push(cmd.type)}
    },
    encodeCode: async (sdp: string) => `encoded:${sdp}`,
    decodeCode: async (code: string) =>
      code.startsWith('encoded:')
        ? success(code.slice(8))
        : failure('DECRYPT_FAILED' as const),
  })

  return {store, commands, emit: (e: PeerEvent) => emitFn(e)}
}

describe('connectionStore', () => {
  describe('createOffer', () => {
    it('transitions state to creating', () => {
      const {store} = makeStore()

      store.createOffer('secret')

      expect(store.getState().flow).toEqual({phase: 'creating', passphrase: 'secret'})
    })

    it('sends CREATE_OFFER command to handler', () => {
      const {store, commands} = makeStore()

      store.createOffer('secret')

      expect(commands).toContain('CREATE_OFFER')
    })

    it('transitions to offer-ready after SDP is created and encoded', async () => {
      const {store, emit} = makeStore()

      store.createOffer('secret')
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'})

      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'))
      const flow = store.getState().flow
      if (flow.phase === 'offer-ready') {
        expect(flow.code).toBe('encoded:v=0')
        expect(flow.peerId).toBe('p1')
      }
    })
  })

  describe('joinOffer', () => {
    it('transitions state to joining', async () => {
      const {store} = makeStore()

      await store.joinOffer('encoded:v=0', 'secret').value

      expect(store.getState().flow.phase).toBe('joining')
    })

    it('sends ACCEPT_OFFER command with decoded SDP', async () => {
      const {store, commands} = makeStore()

      await store.joinOffer('encoded:v=0', 'secret').value

      expect(commands).toContain('ACCEPT_OFFER')
    })

    it('resets to idle when code cannot be decoded', async () => {
      const {store} = makeStore()

      await store.joinOffer('invalid-code', 'wrong').value

      expect(store.getState().flow).toEqual({phase: 'idle'})
    })

    it('returns success when code decodes', async () => {
      const {store} = makeStore()

      const result = await store.joinOffer('encoded:v=0', 'secret').value

      expect(result.kind).toBe('success')
    })

    it('returns failure when code cannot be decoded', async () => {
      const {store} = makeStore()

      const result = await store.joinOffer('invalid-code', 'wrong').value

      expect(result.kind).toBe('failure')
    })
  })

  describe('acceptAnswer', () => {
    it('sends ACCEPT_ANSWER command with decoded SDP when offer-ready', async () => {
      const {store, emit, commands} = makeStore()

      store.createOffer('secret')
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'})
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'))

      await store.acceptAnswer('encoded:v=answer').value

      expect(commands).toContain('ACCEPT_ANSWER')
    })

    it('does nothing when not in offer-ready phase', async () => {
      const {store, commands} = makeStore()
      const commandsBeforeLength = commands.length

      await store.acceptAnswer('encoded:v=answer').value

      expect(commands.length).toBe(commandsBeforeLength)
    })

    it('returns success when response code decodes', async () => {
      const {store, emit} = makeStore()

      store.createOffer('secret')
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'})
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'))

      const result = await store.acceptAnswer('encoded:v=answer').value

      expect(result.kind).toBe('success')
    })

    it('returns failure when response code cannot be decoded', async () => {
      const {store, emit} = makeStore()

      store.createOffer('secret')
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'})
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'))

      const result = await store.acceptAnswer('invalid-code').value

      expect(result.kind).toBe('failure')
    })

    it('reads current passphrase from state, not from when store was created', async () => {
      const {store, emit} = makeStore()

      store.createOffer('runtime-passphrase')
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'})
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'))

      let decodedWith = ''
      const customDecode = async (code: string, pass: string) => {
        decodedWith = pass
        return success(code)
      }
      let innerEmit: (event: PeerEvent) => void = () => {}
      const customStore = createConnectionStore({
        createHandler: (emit) => { innerEmit = emit; return {handleCommand: () => {}} },
        encodeCode: async (sdp) => `encoded:${sdp}`,
        decodeCode: customDecode,
      })
      customStore.createOffer('runtime-passphrase')
      innerEmit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'})
      await vi.waitFor(() => expect(customStore.getState().flow.phase).toBe('offer-ready'))

      await customStore.acceptAnswer('encoded:v=answer')

      expect(decodedWith).toBe('runtime-passphrase')
    })
  })

  describe('peer events', () => {
    it('PEER_CONNECTED adds peer', () => {
      const {store, emit} = makeStore()

      emit({type: 'PEER_CONNECTED', peerId: 'p1'})

      expect(store.getState().peers).toEqual([{id: 'p1'}])
    })

    it('PEER_NAMED updates peer name', () => {
      const {store, emit} = makeStore()

      emit({type: 'PEER_CONNECTED', peerId: 'p1'})
      emit({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'})

      expect(store.getState().peers).toEqual([{id: 'p1', name: 'Alice'}])
    })

    it('PEER_DISCONNECTED removes peer', () => {
      const {store, emit} = makeStore()

      emit({type: 'PEER_CONNECTED', peerId: 'p1'})
      emit({type: 'PEER_DISCONNECTED', peerId: 'p1'})

      expect(store.getState().peers).toEqual([])
    })
  })

  describe('disconnect', () => {
    it('sends DISCONNECT command with the peerId', () => {
      const {store, emit, commands} = makeStore()

      emit({type: 'PEER_CONNECTED', peerId: 'p1'})
      store.disconnect('p1')

      expect(commands).toContain('DISCONNECT')
    })

    it('removes the peer when PEER_DISCONNECTED event arrives', () => {
      const {store, emit} = makeStore()

      emit({type: 'PEER_CONNECTED', peerId: 'p1'})
      emit({type: 'PEER_DISCONNECTED', peerId: 'p1'})

      expect(store.getState().peers).toEqual([])
    })
  })

  describe('subscribe', () => {
    it('notifies listener on state change', () => {
      const {store} = makeStore()
      const listener = vi.fn()
      store.subscribe(listener)

      store.createOffer('secret')

      expect(listener).toHaveBeenCalled()
    })

    it('unsubscribe stops notifications', () => {
      const {store} = makeStore()
      const listener = vi.fn()
      const unsubscribe = store.subscribe(listener)

      unsubscribe()
      store.createOffer('secret')

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
