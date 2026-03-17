export type Peer = {id: string; name?: string; trusted?: boolean; trustsMe?: boolean}

export type OnlinePeer = {peerId: string; name: string}

export type PreviousPeer = {peerId: string; name: string; online: boolean; email?: string}

export type PendingIntroduction = {introId: string; from: string; peer: string}

export type ConnectionFlow =
  | {phase: 'idle'}
  | {phase: 'creating'; passphrase: string}
  | {phase: 'encoding-offer'; peerId: string; sdp: string; passphrase: string}
  | {phase: 'offer-ready'; peerId: string; code: string; passphrase: string}
  | {phase: 'joining'; passphrase: string}
  | {phase: 'encoding-answer'; sdp: string; passphrase: string}
  | {phase: 'answer-ready'; code: string}

export type HandlerState = {
  signalingToPeer: Record<string, string>
  peerToSignaling: Record<string, string>
  offererPeerIds: string[]
  iceRestartAttempts: Record<string, number>
}

export type ConnectionsState = {
  flow: ConnectionFlow
  peers: Peer[]
  pendingIntroductions: PendingIntroduction[]
  onlinePeers: OnlinePeer[]
  previousPeers: PreviousPeer[]
  peerConnectionHealth: Record<string, 'stable' | 'unstable'>
  handlerState: HandlerState
}

export type ConnectionsAction =
  | {type: 'CREATE_OFFER'; passphrase: string}
  | {type: 'OFFER_SDP_READY'; peerId: string; sdp: string}
  | {type: 'OFFER_ENCODED'; peerId: string; code: string}
  | {type: 'JOIN_OFFER'; code: string; passphrase: string}
  | {type: 'ANSWER_SDP_READY'; sdp: string}
  | {type: 'ANSWER_ENCODED'; code: string}
  | {type: 'DECODE_FAILED'}
  | {type: 'PEER_CONNECTED'; peerId: string}
  | {type: 'PEER_DISCONNECTED'; peerId: string}
  | {type: 'PEER_NAMED'; peerId: string; name: string}
  | {type: 'GRANT_TRUST'; peerId: string}
  | {type: 'REVOKE_TRUST'; peerId: string}
  | {type: 'PEER_TRUST_UPDATED'; peerId: string; trusts: boolean}
  | {type: 'INTRODUCTION_RECEIVED'; introId: string; from: string; peer: string}
  | {type: 'INTRODUCTION_RESOLVED'; introId: string}
  | {type: 'ACCEPT_INTRODUCTION'; introId: string}
  | {type: 'DECLINE_INTRODUCTION'; introId: string}
  | {type: 'ONLINE_PEERS_UPDATED'; peers: OnlinePeer[]}
  | {type: 'ONLINE_PEER_JOINED'; peerId: string; name: string}
  | {type: 'ONLINE_PEER_LEFT'; peerId: string}
  | {type: 'SERVER_OFFER_RECEIVED'; signalingPeerId: string; name: string; sdp: string}
  | {type: 'SERVER_ANSWER_RECEIVED'; signalingPeerId: string; sdp: string}
  | {type: 'RELAY_OFFER'; targetPeerId: string; sdp: string}
  | {type: 'RELAY_ANSWER'; targetPeerId: string; sdp: string}
  | {type: 'DISCONNECT'; peerId: string}
  | {type: 'INTRODUCE_PEERS'; peerId1: string; peerId2: string}
  | {type: 'CONNECT_VIA_SERVER'; signalingPeerId: string; name: string}
  | {type: 'PREVIOUS_PEERS_RECEIVED'; peers: PreviousPeer[]}
  | {type: 'ACCEPT_OFFER'; sdp: string}
  | {type: 'ACCEPT_ANSWER'; peerId: string; sdp: string}
  | {type: 'ACCEPT_ANSWER_CODE'; responseCode: string}
  | {type: 'START_SIGNALING'}
  | {type: 'STOP_SIGNALING'}
  | {type: 'RECONNECT_VIA_SERVER'; signalingPeerId: string; name: string}
  | {type: 'PREVIOUS_PEER_CONNECTED'; signalingPeerId: string}
  | {type: 'FORGET_PEER'; peerId: string}
  | {type: 'PEER_CONNECTION_UNSTABLE'; peerId: string}
  | {type: 'PEER_CONNECTION_RESTORED'; peerId: string}
  | {type: 'RELAY_ICE_RESTART'; targetPeerId: string; sdp: string}
  | {type: 'RELAY_ICE_RESTART_ANSWER'; targetPeerId: string; sdp: string}
  | {type: 'ICE_RESTART_RECEIVED'; signalingPeerId: string; sdp: string}
  | {type: 'ICE_RESTART_ANSWER_RECEIVED'; signalingPeerId: string; sdp: string}
  | {type: 'SIGNALING_PEER_REGISTERED'; localPeerId: string; signalingPeerId: string; isOfferer: boolean}
  | {type: 'ICE_RESTART_ATTEMPTED'; peerId: string}
  | {type: 'EMAIL_SHARED_RECEIVED'; fromPeerId: string; email: string}
  | {type: 'EMAIL_REVOKED_RECEIVED'; fromPeerId: string}
  | {type: 'SHARE_EMAIL'; targetPeerId: string}
  | {type: 'STOP_SHARING_EMAIL'; targetPeerId: string}
  | {type: 'UPDATE_EMAIL'; email: string}

const handlerInitialState: HandlerState = {
  signalingToPeer: {},
  peerToSignaling: {},
  offererPeerIds: [],
  iceRestartAttempts: {},
};

export const initialState: ConnectionsState = {
  flow: {phase: 'idle'},
  peers: [],
  pendingIntroductions: [],
  onlinePeers: [],
  previousPeers: [],
  peerConnectionHealth: {},
  handlerState: handlerInitialState,
};

const handlerReducer = (state: HandlerState, action: ConnectionsAction): HandlerState => {
  switch (action.type) {
    case 'SIGNALING_PEER_REGISTERED':
      return {
        ...state,
        signalingToPeer: {...state.signalingToPeer, [action.signalingPeerId]: action.localPeerId},
        peerToSignaling: {...state.peerToSignaling, [action.localPeerId]: action.signalingPeerId},
        offererPeerIds: action.isOfferer ? [...state.offererPeerIds, action.localPeerId] : state.offererPeerIds,
      };
    case 'ICE_RESTART_ATTEMPTED':
      return {
        ...state,
        iceRestartAttempts: {...state.iceRestartAttempts, [action.peerId]: (state.iceRestartAttempts[action.peerId] ?? 0) + 1},
      };
    case 'PEER_CONNECTION_RESTORED':
      return {
        ...state,
        iceRestartAttempts: Object.fromEntries(Object.entries(state.iceRestartAttempts).filter(([k]) => k !== action.peerId)),
      };
    case 'PEER_DISCONNECTED': {
      const signalingPeerId = state.peerToSignaling[action.peerId];
      return {
        ...state,
        signalingToPeer: signalingPeerId
          ? Object.fromEntries(Object.entries(state.signalingToPeer).filter(([k]) => k !== signalingPeerId))
          : state.signalingToPeer,
        peerToSignaling: Object.fromEntries(Object.entries(state.peerToSignaling).filter(([k]) => k !== action.peerId)),
        offererPeerIds: state.offererPeerIds.filter(id => id !== action.peerId),
        iceRestartAttempts: Object.fromEntries(Object.entries(state.iceRestartAttempts).filter(([k]) => k !== action.peerId)),
      };
    }
    default:
      return state;
  }
};

const coreConnectionsReducer = (state: ConnectionsState, action: ConnectionsAction): ConnectionsState => {
  switch (action.type) {
    case 'CREATE_OFFER':
      return {...state, flow: {phase: 'creating', passphrase: action.passphrase}};

    case 'OFFER_SDP_READY':
      if (state.flow.phase !== 'creating') return state;
      return {...state, flow: {phase: 'encoding-offer', peerId: action.peerId, sdp: action.sdp, passphrase: state.flow.passphrase}};

    case 'OFFER_ENCODED':
      if (state.flow.phase !== 'encoding-offer') return state;
      return {...state, flow: {phase: 'offer-ready', peerId: action.peerId, code: action.code, passphrase: state.flow.passphrase}};

    case 'JOIN_OFFER':
      return {...state, flow: {phase: 'joining', passphrase: action.passphrase}};

    case 'ANSWER_SDP_READY':
      if (state.flow.phase !== 'joining') return state;
      return {...state, flow: {phase: 'encoding-answer', sdp: action.sdp, passphrase: state.flow.passphrase}};

    case 'ANSWER_ENCODED':
      return {...state, flow: {phase: 'answer-ready', code: action.code}};

    case 'DECODE_FAILED':
      return {...state, flow: {phase: 'idle'}};

    case 'PEER_CONNECTED':
      return {...state, peers: [...state.peers, {id: action.peerId}]};

    case 'PEER_DISCONNECTED':
      return {
        ...state,
        peers: state.peers.filter(p => p.id !== action.peerId),
        peerConnectionHealth: Object.fromEntries(Object.entries(state.peerConnectionHealth).filter(([k]) => k !== action.peerId)),
      };

    case 'PEER_NAMED':
      return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, name: action.name} : p)};

    case 'GRANT_TRUST':
      return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trusted: true} : p)};

    case 'REVOKE_TRUST':
      return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trusted: false} : p)};

    case 'PEER_TRUST_UPDATED':
      return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trustsMe: action.trusts} : p)};

    case 'INTRODUCTION_RECEIVED':
      return {...state, pendingIntroductions: [...state.pendingIntroductions, {introId: action.introId, from: action.from, peer: action.peer}]};

    case 'INTRODUCTION_RESOLVED':
    case 'ACCEPT_INTRODUCTION':
    case 'DECLINE_INTRODUCTION':
      return {...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)};

    case 'ONLINE_PEERS_UPDATED':
      return {...state, onlinePeers: action.peers};

    case 'ONLINE_PEER_JOINED':
      return {
        ...state,
        onlinePeers: [...state.onlinePeers, {peerId: action.peerId, name: action.name}],
        previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, online: true} : p),
      };

    case 'ONLINE_PEER_LEFT':
      return {
        ...state,
        onlinePeers: state.onlinePeers.filter(p => p.peerId !== action.peerId),
        previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, online: false} : p),
      };

    case 'PREVIOUS_PEERS_RECEIVED':
      return {...state, previousPeers: action.peers};

    case 'PREVIOUS_PEER_CONNECTED':
      return {...state, previousPeers: state.previousPeers.filter(p => p.peerId !== action.signalingPeerId)};

    case 'FORGET_PEER':
      return {...state, previousPeers: state.previousPeers.filter(p => p.peerId !== action.peerId)};

    case 'EMAIL_SHARED_RECEIVED':
      return {...state, previousPeers: state.previousPeers.map(p => p.peerId === action.fromPeerId ? {...p, email: action.email} : p)};

    case 'EMAIL_REVOKED_RECEIVED':
      return {...state, previousPeers: state.previousPeers.map(p =>
        p.peerId !== action.fromPeerId ? p : {peerId: p.peerId, name: p.name, online: p.online}
      )};

    case 'PEER_CONNECTION_UNSTABLE':
      return {...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'unstable'}};

    case 'PEER_CONNECTION_RESTORED':
      return {...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'stable'}};

    default:
      return state;
  }
};

export const connectionsReducer = (state: ConnectionsState, action: ConnectionsAction): ConnectionsState => ({
  ...coreConnectionsReducer(state, action),
  handlerState: handlerReducer(state.handlerState, action),
});
