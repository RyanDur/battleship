import {connectionsReducer, initialState} from './connections'
import type {ConnectionsState, ConnectionsAction} from './connections'
import type {PeerCommand, PeerEvent} from '../types/worker-messages'
import type {CodecError} from '../protocol/connection-code'
import type {Result} from '../lib/result'

type Handler = {handleCommand: (cmd: PeerCommand) => void}

type StoreDeps = {
  createHandler: (emit: (event: PeerEvent) => void) => Handler
  encodeCode: (sdp: string, passphrase: string) => Promise<string>
  decodeCode: (code: string, passphrase: string) => Promise<Result<string, CodecError>>
}

export type ConnectionStore = {
  getState: () => ConnectionsState
  subscribe: (listener: () => void) => () => void
  createOffer: (passphrase: string) => void
  joinOffer: (code: string, passphrase: string) => Promise<void>
  acceptAnswer: (responseCode: string) => Promise<void>
  disconnect: (peerId: string) => void
}

export const createConnectionStore = (deps: StoreDeps): ConnectionStore => {
  let state = initialState
  const listeners = new Set<() => void>()

  const dispatch = (action: ConnectionsAction) => {
    state = connectionsReducer(state, action)
    listeners.forEach(fn => fn())

    if (state.flow.phase === 'encoding-offer') {
      const {peerId, sdp, passphrase} = state.flow
      deps.encodeCode(sdp, passphrase).then(code => dispatch({type: 'OFFER_ENCODED', peerId, code}))
    } else if (state.flow.phase === 'encoding-answer') {
      const {sdp, passphrase} = state.flow
      deps.encodeCode(sdp, passphrase).then(code => dispatch({type: 'ANSWER_ENCODED', code}))
    }
  }

  const emit = (event: PeerEvent) => {
    if (event.type === 'PEER_CONNECTED') dispatch({type: 'PEER_CONNECTED', peerId: event.peerId})
    else if (event.type === 'PEER_NAMED') dispatch({type: 'PEER_NAMED', peerId: event.peerId, name: event.name})
    else if (event.type === 'PEER_DISCONNECTED') dispatch({type: 'PEER_DISCONNECTED', peerId: event.peerId})
    else if (event.type === 'OFFER_CREATED') dispatch({type: 'OFFER_SDP_READY', peerId: event.peerId, sdp: event.sdp})
    else if (event.type === 'ANSWER_CREATED') dispatch({type: 'ANSWER_SDP_READY', sdp: event.sdp})
  }

  const handler = deps.createHandler(emit)

  return {
    getState: () => state,

    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    createOffer: (passphrase) => {
      dispatch({type: 'CREATE_OFFER', passphrase})
      handler.handleCommand({type: 'CREATE_OFFER'})
    },

    joinOffer: async (code, passphrase) => {
      dispatch({type: 'JOIN_OFFER', passphrase})
      const result = await deps.decodeCode(code, passphrase)
      result
        .onSuccess(sdp => handler.handleCommand({type: 'ACCEPT_OFFER', sdp}))
        .onFailure(() => {
          console.warn('Failed to decode offer code — wrong passphrase?')
          dispatch({type: 'DECODE_FAILED'})
        })
    },

    acceptAnswer: async (responseCode) => {
      const {flow} = state
      if (flow.phase !== 'offer-ready') return
      const result = await deps.decodeCode(responseCode, flow.passphrase)
      result
        .onSuccess(sdp => handler.handleCommand({type: 'ACCEPT_ANSWER', peerId: flow.peerId, sdp}))
        .onFailure(() => console.warn('Failed to decode response code — wrong passphrase?'))
    },

    disconnect: (peerId) => {
      handler.handleCommand({type: 'DISCONNECT', peerId})
    },
  }
}
