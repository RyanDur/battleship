import {createReducer} from '../lib/maybe';

export type TransportFlow =
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

export type TransportState = {
  flow: TransportFlow
  handlerState: HandlerState
  peerConnectionHealth: Record<string, 'stable' | 'unstable'>
}

export type TransportAction =
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
  | {type: 'ACCEPT_OFFER'; sdp: string}
  | {type: 'ACCEPT_ANSWER'; peerId: string; sdp: string}
  | {type: 'ACCEPT_ANSWER_CODE'; responseCode: string}
  | {type: 'SERVER_OFFER_RECEIVED'; signalingPeerId: string; name: string; sdp: string}
  | {type: 'SERVER_ANSWER_RECEIVED'; signalingPeerId: string; sdp: string}
  | {type: 'RELAY_OFFER'; targetPeerId: string; sdp: string}
  | {type: 'RELAY_ANSWER'; targetPeerId: string; sdp: string}
  | {type: 'CONNECT_VIA_SERVER'; signalingPeerId: string; name: string}
  | {type: 'RECONNECT_VIA_SERVER'; signalingPeerId: string; name: string}
  | {type: 'START_SIGNALING'}
  | {type: 'STOP_SIGNALING'}
  | {type: 'PEER_CONNECTION_UNSTABLE'; peerId: string}
  | {type: 'PEER_CONNECTION_RESTORED'; peerId: string}
  | {type: 'RELAY_ICE_RESTART'; targetPeerId: string; sdp: string}
  | {type: 'RELAY_ICE_RESTART_ANSWER'; targetPeerId: string; sdp: string}
  | {type: 'ICE_RESTART_RECEIVED'; signalingPeerId: string; sdp: string}
  | {type: 'ICE_RESTART_ANSWER_RECEIVED'; signalingPeerId: string; sdp: string}
  | {type: 'ICE_RESTART_ATTEMPTED'; peerId: string}
  | {type: 'SIGNALING_PEER_REGISTERED'; localPeerId: string; signalingPeerId: string; isOfferer: boolean}
  | {type: 'INTRO_CHANNEL_REGISTERED'; introId: string; relayPeerId: string}
  | {type: 'INTRO_CONNECTION_REGISTERED'; introId: string; newPeerId: string}
  | {type: 'INTRO_CONNECTION_CLEARED'; introId: string}
  | {type: 'ACCEPT_INTRODUCTION'; introId: string}
  | {type: 'DECLINE_INTRODUCTION'; introId: string}
  | {type: 'DELIVER_TO_SERVER'; message: unknown}
  | {type: 'PEER_MESSAGE_RECEIVED'; peerId: string; data: unknown}

const handlerInitialState: HandlerState = {
  signalingToPeer: {},
  peerToSignaling: {},
  offererPeerIds: [],
  iceRestartAttempts: {},
  introChannels: {},
  introConnections: {},
};

export const transportInitialState: TransportState = {
  flow: {phase: 'idle'},
  handlerState: handlerInitialState,
  peerConnectionHealth: {},
};

const handlerReducer = createReducer<HandlerState, TransportAction, {type: string}>({
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

const coreTransportReducer = createReducer<TransportState, TransportAction, {type: string}>({
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
  }),
  PEER_DISCONNECTED: (state, action) => ({
    ...state,
    peerConnectionHealth: Object.fromEntries(Object.entries(state.peerConnectionHealth).filter(([k]) => k !== action.peerId)),
  }),
  PEER_CONNECTION_UNSTABLE: (state, action) => ({...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'unstable'}}),
  PEER_CONNECTION_RESTORED: (state, action) => ({...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'stable'}}),
});

export const transportReducer = (state: TransportState, action: {type: string}): TransportState => ({
  ...coreTransportReducer(state, action),
  handlerState: handlerReducer(state.handlerState, action),
});
