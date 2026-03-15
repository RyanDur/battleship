export type Peer = {id: string; name?: string}

export type ConnectionFlow =
  | {phase: 'idle'}
  | {phase: 'creating'; passphrase: string}
  | {phase: 'encoding-offer'; peerId: string; sdp: string; passphrase: string}
  | {phase: 'offer-ready'; peerId: string; code: string; passphrase: string}
  | {phase: 'joining'; passphrase: string}
  | {phase: 'encoding-answer'; sdp: string; passphrase: string}
  | {phase: 'answer-ready'; code: string}

export type ConnectionsState = {
  flow: ConnectionFlow
  peers: Peer[]
}

export type ConnectionsAction =
  | {type: 'CREATE_OFFER'; passphrase: string}
  | {type: 'OFFER_SDP_READY'; peerId: string; sdp: string}
  | {type: 'OFFER_ENCODED'; peerId: string; code: string}
  | {type: 'JOIN_OFFER'; passphrase: string}
  | {type: 'ANSWER_SDP_READY'; sdp: string}
  | {type: 'ANSWER_ENCODED'; code: string}
  | {type: 'DECODE_FAILED'}
  | {type: 'PEER_CONNECTED'; peerId: string}
  | {type: 'PEER_DISCONNECTED'; peerId: string}
  | {type: 'PEER_NAMED'; peerId: string; name: string}

export const initialState: ConnectionsState = {
  flow: {phase: 'idle'},
  peers: [],
}

export const connectionsReducer = (state: ConnectionsState, action: ConnectionsAction): ConnectionsState => {
  switch (action.type) {
    case 'CREATE_OFFER':
      return {...state, flow: {phase: 'creating', passphrase: action.passphrase}}

    case 'OFFER_SDP_READY':
      if (state.flow.phase !== 'creating') return state
      return {...state, flow: {phase: 'encoding-offer', peerId: action.peerId, sdp: action.sdp, passphrase: state.flow.passphrase}}

    case 'OFFER_ENCODED':
      if (state.flow.phase !== 'encoding-offer') return state
      return {...state, flow: {phase: 'offer-ready', peerId: action.peerId, code: action.code, passphrase: state.flow.passphrase}}

    case 'JOIN_OFFER':
      return {...state, flow: {phase: 'joining', passphrase: action.passphrase}}

    case 'ANSWER_SDP_READY':
      if (state.flow.phase !== 'joining') return state
      return {...state, flow: {phase: 'encoding-answer', sdp: action.sdp, passphrase: state.flow.passphrase}}

    case 'ANSWER_ENCODED':
      return {...state, flow: {phase: 'answer-ready', code: action.code}}

    case 'DECODE_FAILED':
      return {...state, flow: {phase: 'idle'}}

    case 'PEER_CONNECTED':
      return {...state, peers: [...state.peers, {id: action.peerId}]}

    case 'PEER_DISCONNECTED':
      return {...state, peers: state.peers.filter(p => p.id !== action.peerId)}

    case 'PEER_NAMED':
      return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, name: action.name} : p)}
  }
}
