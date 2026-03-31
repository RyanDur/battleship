import {createReducer} from '../lib/maybe';

export type Peer = {id: string; name?: string; trusted?: boolean; trustsMe?: boolean}

export type OnlinePeer = {peerId: string; name: string}

export type PreviousPeer = {peerId: string; name: string; online: boolean; email?: string}

export type PendingIntroduction = {introId: string; from: string; peer: string}

export type ConnectionFlow =
  | {phase: 'idle'}
  | {phase: 'creating'; passphrase: string}
  | {phase: 'encoding-offer'; peerId: string; sdp: string; passphrase: string}
  | {phase: 'offer-ready'; peerId: string; code: string; passphrase: string}
  | {phase: 'offer-failed'}
  | {phase: 'joining'; passphrase: string}
  | {phase: 'encoding-answer'; sdp: string; passphrase: string}
  | {phase: 'answer-ready'; code: string}

export type HandlerState = {
  signalingToPeer: Record<string, string>
  peerToSignaling: Record<string, string>
  offererPeerIds: string[]
  iceRestartAttempts: Record<string, number>
  introChannels: Record<string, string>
  introConnections: Record<string, string>
}

export type Message = {peerId: string; text: string; fromSelf: boolean}

export type ConnectionsState = {
  flow: ConnectionFlow
  peers: Peer[]
  messages: Message[]
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
  | {type: 'OFFER_FAILED'}
  | {type: 'CANCEL_OFFER'}
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
  | {type: 'INTRO_CHANNEL_REGISTERED'; introId: string; relayPeerId: string}
  | {type: 'INTRO_CONNECTION_REGISTERED'; introId: string; newPeerId: string}
  | {type: 'INTRO_CONNECTION_CLEARED'; introId: string}
  | {type: 'EMAIL_SHARED_RECEIVED'; fromPeerId: string; email: string}
  | {type: 'EMAIL_REVOKED_RECEIVED'; fromPeerId: string}
  | {type: 'SHARE_EMAIL'; targetPeerId: string}
  | {type: 'STOP_SHARING_EMAIL'; targetPeerId: string}
  | {type: 'UPDATE_EMAIL'; email: string}
  | {type: 'SAVE_PEER_EMAIL'; peerId: string; email: string}
  | {type: 'MESSAGE_RECEIVED'; peerId: string; text: string}
  | {type: 'SEND_MESSAGE'; peerId: string; text: string}
  | {type: 'SEND_TO_PEER'; peerId: string; message: Record<string, unknown>}

const handlerInitialState: HandlerState = {
  signalingToPeer: {},
  peerToSignaling: {},
  offererPeerIds: [],
  iceRestartAttempts: {},
  introChannels: {},
  introConnections: {},
};

export const initialState: ConnectionsState = {
  flow: {phase: 'idle'},
  peers: [],
  messages: [],
  pendingIntroductions: [],
  onlinePeers: [],
  previousPeers: [],
  peerConnectionHealth: {},
  handlerState: handlerInitialState,
};

const handlerReducer = createReducer<HandlerState, ConnectionsAction>({
  SIGNALING_PEER_REGISTERED: (state, action) => ({
    ...state,
    signalingToPeer: {...state.signalingToPeer, [action.signalingPeerId]: action.localPeerId},
    peerToSignaling: {...state.peerToSignaling, [action.localPeerId]: action.signalingPeerId},
    offererPeerIds: action.isOfferer ? [...state.offererPeerIds, action.localPeerId] : state.offererPeerIds,
  }),
  ICE_RESTART_ATTEMPTED: (state, action) => ({
    ...state,
    iceRestartAttempts: {...state.iceRestartAttempts, [action.peerId]: (state.iceRestartAttempts[action.peerId] ?? 0) + 1},
  }),
  PEER_CONNECTION_RESTORED: (state, action) => ({
    ...state,
    iceRestartAttempts: Object.fromEntries(Object.entries(state.iceRestartAttempts).filter(([k]) => k !== action.peerId)),
  }),
  INTRO_CHANNEL_REGISTERED: (state, action) => ({
    ...state, introChannels: {...state.introChannels, [action.introId]: action.relayPeerId},
  }),
  INTRO_CONNECTION_REGISTERED: (state, action) => ({
    ...state, introConnections: {...state.introConnections, [action.introId]: action.newPeerId},
  }),
  INTRO_CONNECTION_CLEARED: (state, action) => ({
    ...state,
    introConnections: Object.fromEntries(Object.entries(state.introConnections).filter(([k]) => k !== action.introId)),
  }),
  ACCEPT_INTRODUCTION: (state, action) => ({
    ...state,
    introChannels: Object.fromEntries(Object.entries(state.introChannels).filter(([k]) => k !== action.introId)),
  }),
  DECLINE_INTRODUCTION: (state, action) => ({
    ...state,
    introChannels: Object.fromEntries(Object.entries(state.introChannels).filter(([k]) => k !== action.introId)),
  }),
  PEER_DISCONNECTED: (state, action) => {
    const signalingPeerId = state.peerToSignaling[action.peerId];
    const clearedIntroChannels = Object.fromEntries(
      Object.entries(state.introChannels).filter(([, v]) => v !== action.peerId)
    );
    const clearedIntroConnections = Object.fromEntries(
      Object.entries(state.introConnections).filter(([, v]) => v !== action.peerId)
    );
    return {
      ...state,
      signalingToPeer: signalingPeerId
        ? Object.fromEntries(Object.entries(state.signalingToPeer).filter(([k]) => k !== signalingPeerId))
        : state.signalingToPeer,
      peerToSignaling: Object.fromEntries(Object.entries(state.peerToSignaling).filter(([k]) => k !== action.peerId)),
      offererPeerIds: state.offererPeerIds.filter(id => id !== action.peerId),
      iceRestartAttempts: Object.fromEntries(Object.entries(state.iceRestartAttempts).filter(([k]) => k !== action.peerId)),
      introChannels: clearedIntroChannels,
      introConnections: clearedIntroConnections,
    };
  },
});

const coreConnectionsReducer = createReducer<ConnectionsState, ConnectionsAction>({
  CREATE_OFFER: (state, action) => ({...state, flow: {phase: 'creating', passphrase: action.passphrase}}),
  OFFER_SDP_READY: (state, action) => {
    if (state.flow.phase !== 'creating') return state;
    return {...state, flow: {phase: 'encoding-offer', peerId: action.peerId, sdp: action.sdp, passphrase: state.flow.passphrase}};
  },
  OFFER_ENCODED: (state, action) => {
    if (state.flow.phase !== 'encoding-offer') return state;
    return {...state, flow: {phase: 'offer-ready', peerId: action.peerId, code: action.code, passphrase: state.flow.passphrase}};
  },
  JOIN_OFFER: (state, action) => ({...state, flow: {phase: 'joining', passphrase: action.passphrase}}),
  ANSWER_SDP_READY: (state, action) => {
    if (state.flow.phase !== 'joining') return state;
    return {...state, flow: {phase: 'encoding-answer', sdp: action.sdp, passphrase: state.flow.passphrase}};
  },
  ANSWER_ENCODED: (state, action) => ({...state, flow: {phase: 'answer-ready', code: action.code}}),
  DECODE_FAILED: (state) => ({...state, flow: {phase: 'idle'}}),
  CANCEL_OFFER: (state) => ({...state, flow: {phase: 'idle'}}),
  OFFER_FAILED: (state) => ({...state, flow: {phase: 'offer-failed'}}),
  PEER_CONNECTED: (state, action) => ({
    ...state,
    flow: 'peerId' in state.flow && state.flow.peerId === action.peerId ? {phase: 'idle' as const} : state.flow,
    peers: [...state.peers, {id: action.peerId}],
  }),
  PEER_DISCONNECTED: (state, action) => {
    const signalingPeerId = state.handlerState.peerToSignaling[action.peerId];
    const peerName = state.peers.find(p => p.id === action.peerId)?.name;
    const alreadyInPrevious = signalingPeerId ? state.previousPeers.some(p => p.peerId === signalingPeerId) : true;
    const updatedPreviousPeers = signalingPeerId && peerName && !alreadyInPrevious
      ? [...state.previousPeers, {peerId: signalingPeerId, name: peerName, online: false}]
      : state.previousPeers;
    return {
      ...state,
      peers: state.peers.filter(p => p.id !== action.peerId),
      peerConnectionHealth: Object.fromEntries(Object.entries(state.peerConnectionHealth).filter(([k]) => k !== action.peerId)),
      previousPeers: updatedPreviousPeers,
    };
  },
  PEER_NAMED: (state, action) => ({...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, name: action.name} : p)}),
  GRANT_TRUST: (state, action) => ({...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trusted: true} : p)}),
  REVOKE_TRUST: (state, action) => ({...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trusted: false} : p)}),
  PEER_TRUST_UPDATED: (state, action) => ({...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trustsMe: action.trusts} : p)}),
  INTRODUCTION_RECEIVED: (state, action) => ({...state, pendingIntroductions: [...state.pendingIntroductions, {introId: action.introId, from: action.from, peer: action.peer}]}),
  INTRODUCTION_RESOLVED: (state, action) => ({...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)}),
  ACCEPT_INTRODUCTION: (state, action) => ({...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)}),
  DECLINE_INTRODUCTION: (state, action) => ({...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)}),
  ONLINE_PEERS_UPDATED: (state, action) => ({...state, onlinePeers: action.peers}),
  ONLINE_PEER_JOINED: (state, action) => ({
    ...state,
    onlinePeers: [...state.onlinePeers, {peerId: action.peerId, name: action.name}],
    previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, online: true} : p),
  }),
  ONLINE_PEER_LEFT: (state, action) => ({
    ...state,
    onlinePeers: state.onlinePeers.filter(p => p.peerId !== action.peerId),
    previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, online: false} : p),
  }),
  PREVIOUS_PEERS_RECEIVED: (state, action) => ({...state, previousPeers: action.peers}),
  PREVIOUS_PEER_CONNECTED: (state, action) => ({...state, previousPeers: state.previousPeers.filter(p => p.peerId !== action.signalingPeerId)}),
  FORGET_PEER: (state, action) => ({...state, previousPeers: state.previousPeers.filter(p => p.peerId !== action.peerId)}),
  EMAIL_SHARED_RECEIVED: (state, action) => ({...state, previousPeers: state.previousPeers.map(p => p.peerId === action.fromPeerId ? {...p, email: action.email} : p)}),
  EMAIL_REVOKED_RECEIVED: (state, action) => ({...state, previousPeers: state.previousPeers.map(p =>
    p.peerId !== action.fromPeerId ? p : {peerId: p.peerId, name: p.name, online: p.online}
  )}),
  SAVE_PEER_EMAIL: (state, action) => ({...state, previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, email: action.email} : p)}),
  MESSAGE_RECEIVED: (state, action) => ({...state, messages: [...state.messages, {peerId: action.peerId, text: action.text, fromSelf: false}]}),
  SEND_MESSAGE: (state, action) => ({...state, messages: [...state.messages, {peerId: action.peerId, text: action.text, fromSelf: true}]}),
  PEER_CONNECTION_UNSTABLE: (state, action) => ({...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'unstable'}}),
  PEER_CONNECTION_RESTORED: (state, action) => ({...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'stable'}}),
});

export const connectionsReducer = (state: ConnectionsState, action: ConnectionsAction): ConnectionsState => ({
  ...coreConnectionsReducer(state, action),
  handlerState: handlerReducer(state.handlerState, action),
});
