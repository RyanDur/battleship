import type {Board} from '../game/board';
import type {Shot, P2pGamePhase, P2pGame, AiGamePhase, AiGameState} from '../game/game';
import {maybe} from '../lib/maybe';

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
  board: Board | null
  boardLoading: boolean
  gameState: AiGameState | null
  p2pGame: P2pGame | null
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
  | {type: 'SAVE_BOARD'; board: Board}
  | {type: 'BOARD_SAVED'}
  | {type: 'LOAD_BOARD'}
  | {type: 'BOARD_LOADED'; board: Board}
  | {type: 'BOARD_NOT_FOUND'}
  | {type: 'START_GAME'}
  | {type: 'GAME_STARTED'; gameState: AiGameState}
  | {type: 'FIRE_SHOT'; row: number; col: number}
  | {type: 'FIRE_RESULT'; playerShot: Shot; aiShot: Shot | null; phase: AiGamePhase}
  | {type: 'LOAD_GAME'}
  | {type: 'GAME_STATE'; gameState: AiGameState}
  | {type: 'GAME_NOT_FOUND'}
  | {type: 'CHALLENGE_PEER'; opponentId: string}
  | {type: 'CHALLENGE_RECEIVED'; opponentId: string}
  | {type: 'ACCEPT_CHALLENGE'}
  | {type: 'DECLINE_CHALLENGE'}
  | {type: 'CANCEL_CHALLENGE'}
  | {type: 'P2P_BOARD_READY'; boardHash: string}
  | {type: 'OPPONENT_BOARD_READY'; boardHash: string}
  | {type: 'CLAIM_FIRST_TURN'}
  | {type: 'TAKE_FIRST_TURN'}
  | {type: 'COIN_FLIP_COMMIT'; hash: string}
  | {type: 'COIN_FLIP_REVEAL'; value: number}
  | {type: 'TURN_ORDER_DECIDED'; iGoFirst: boolean}
  | {type: 'P2P_FIRE'; row: number; col: number}
  | {type: 'P2P_FIRE_RESULT'; shot: Shot}
  | {type: 'OPPONENT_FIRED'; shot: Shot}
  | {type: 'P2P_GAME_OVER'; winner: 'me' | 'opponent'}
  | {type: 'FORFEIT_GAME'}
  | {type: 'OPPONENT_FORFEITED'}
  | {type: 'SAVE_P2P_GAME'; gameState?: P2pGame}
  | {type: 'LOAD_P2P_GAME'; opponentId: string}
  | {type: 'P2P_GAME_LOADED'; gameState: P2pGame}
  | {type: 'P2P_STATE_SYNC'; opponentId: string; myShots: Shot[]; opponentShots: Shot[]; phase: P2pGamePhase}
  | {type: 'P2P_STATE_MISMATCH'}
  | {type: 'CLEAR_P2P_GAME'}
  | {type: 'OPPONENT_BOARD_REVEALED'; board: Board; verified: boolean}
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
  board: null,
  boardLoading: true,
  gameState: null,
  p2pGame: null,
};

const handlerHandlers: Partial<Record<ConnectionsAction['type'], (state: HandlerState, action: ConnectionsAction) => HandlerState>> = {
  SIGNALING_PEER_REGISTERED: (state, action) => {
    if (action.type !== 'SIGNALING_PEER_REGISTERED') return state;
    return {
      ...state,
      signalingToPeer: {...state.signalingToPeer, [action.signalingPeerId]: action.localPeerId},
      peerToSignaling: {...state.peerToSignaling, [action.localPeerId]: action.signalingPeerId},
      offererPeerIds: action.isOfferer ? [...state.offererPeerIds, action.localPeerId] : state.offererPeerIds,
    };
  },
  ICE_RESTART_ATTEMPTED: (state, action) => {
    if (action.type !== 'ICE_RESTART_ATTEMPTED') return state;
    return {
      ...state,
      iceRestartAttempts: {...state.iceRestartAttempts, [action.peerId]: (state.iceRestartAttempts[action.peerId] ?? 0) + 1},
    };
  },
  PEER_CONNECTION_RESTORED: (state, action) => {
    if (action.type !== 'PEER_CONNECTION_RESTORED') return state;
    return {
      ...state,
      iceRestartAttempts: Object.fromEntries(Object.entries(state.iceRestartAttempts).filter(([k]) => k !== action.peerId)),
    };
  },
  INTRO_CHANNEL_REGISTERED: (state, action) => {
    if (action.type !== 'INTRO_CHANNEL_REGISTERED') return state;
    return {...state, introChannels: {...state.introChannels, [action.introId]: action.relayPeerId}};
  },
  INTRO_CONNECTION_REGISTERED: (state, action) => {
    if (action.type !== 'INTRO_CONNECTION_REGISTERED') return state;
    return {...state, introConnections: {...state.introConnections, [action.introId]: action.newPeerId}};
  },
  INTRO_CONNECTION_CLEARED: (state, action) => {
    if (action.type !== 'INTRO_CONNECTION_CLEARED') return state;
    return {
      ...state,
      introConnections: Object.fromEntries(Object.entries(state.introConnections).filter(([k]) => k !== action.introId)),
    };
  },
  ACCEPT_INTRODUCTION: (state, action) => {
    if (action.type !== 'ACCEPT_INTRODUCTION') return state;
    return {
      ...state,
      introChannels: Object.fromEntries(Object.entries(state.introChannels).filter(([k]) => k !== action.introId)),
    };
  },
  DECLINE_INTRODUCTION: (state, action) => {
    if (action.type !== 'DECLINE_INTRODUCTION') return state;
    return {
      ...state,
      introChannels: Object.fromEntries(Object.entries(state.introChannels).filter(([k]) => k !== action.introId)),
    };
  },
  PEER_DISCONNECTED: (state, action) => {
    if (action.type !== 'PEER_DISCONNECTED') return state;
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
};

const handlerReducer = (state: HandlerState, action: ConnectionsAction): HandlerState =>
  maybe(handlerHandlers[action.type]).map(fn => fn(state, action)).orElse(state);

const coreHandlers: Partial<Record<ConnectionsAction['type'], (state: ConnectionsState, action: ConnectionsAction) => ConnectionsState>> = {
  CREATE_OFFER: (state, action) => {
    if (action.type !== 'CREATE_OFFER') return state;
    return {...state, flow: {phase: 'creating', passphrase: action.passphrase}};
  },
  OFFER_SDP_READY: (state, action) => {
    if (action.type !== 'OFFER_SDP_READY') return state;
    if (state.flow.phase !== 'creating') return state;
    return {...state, flow: {phase: 'encoding-offer', peerId: action.peerId, sdp: action.sdp, passphrase: state.flow.passphrase}};
  },
  OFFER_ENCODED: (state, action) => {
    if (action.type !== 'OFFER_ENCODED') return state;
    if (state.flow.phase !== 'encoding-offer') return state;
    return {...state, flow: {phase: 'offer-ready', peerId: action.peerId, code: action.code, passphrase: state.flow.passphrase}};
  },
  JOIN_OFFER: (state, action) => {
    if (action.type !== 'JOIN_OFFER') return state;
    return {...state, flow: {phase: 'joining', passphrase: action.passphrase}};
  },
  ANSWER_SDP_READY: (state, action) => {
    if (action.type !== 'ANSWER_SDP_READY') return state;
    if (state.flow.phase !== 'joining') return state;
    return {...state, flow: {phase: 'encoding-answer', sdp: action.sdp, passphrase: state.flow.passphrase}};
  },
  ANSWER_ENCODED: (state, action) => {
    if (action.type !== 'ANSWER_ENCODED') return state;
    return {...state, flow: {phase: 'answer-ready', code: action.code}};
  },
  DECODE_FAILED: (state) => ({...state, flow: {phase: 'idle'}}),
  CANCEL_OFFER: (state) => ({...state, flow: {phase: 'idle'}}),
  OFFER_FAILED: (state) => ({...state, flow: {phase: 'offer-failed'}}),
  PEER_CONNECTED: (state, action) => {
    if (action.type !== 'PEER_CONNECTED') return state;
    return {
      ...state,
      flow: 'peerId' in state.flow && state.flow.peerId === action.peerId ? {phase: 'idle' as const} : state.flow,
      peers: [...state.peers, {id: action.peerId}],
    };
  },
  PEER_DISCONNECTED: (state, action) => {
    if (action.type !== 'PEER_DISCONNECTED') return state;
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
  PEER_NAMED: (state, action) => {
    if (action.type !== 'PEER_NAMED') return state;
    return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, name: action.name} : p)};
  },
  GRANT_TRUST: (state, action) => {
    if (action.type !== 'GRANT_TRUST') return state;
    return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trusted: true} : p)};
  },
  REVOKE_TRUST: (state, action) => {
    if (action.type !== 'REVOKE_TRUST') return state;
    return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trusted: false} : p)};
  },
  PEER_TRUST_UPDATED: (state, action) => {
    if (action.type !== 'PEER_TRUST_UPDATED') return state;
    return {...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trustsMe: action.trusts} : p)};
  },
  INTRODUCTION_RECEIVED: (state, action) => {
    if (action.type !== 'INTRODUCTION_RECEIVED') return state;
    return {...state, pendingIntroductions: [...state.pendingIntroductions, {introId: action.introId, from: action.from, peer: action.peer}]};
  },
  INTRODUCTION_RESOLVED: (state, action) => {
    if (action.type !== 'INTRODUCTION_RESOLVED') return state;
    return {...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)};
  },
  ACCEPT_INTRODUCTION: (state, action) => {
    if (action.type !== 'ACCEPT_INTRODUCTION') return state;
    return {...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)};
  },
  DECLINE_INTRODUCTION: (state, action) => {
    if (action.type !== 'DECLINE_INTRODUCTION') return state;
    return {...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)};
  },
  ONLINE_PEERS_UPDATED: (state, action) => {
    if (action.type !== 'ONLINE_PEERS_UPDATED') return state;
    return {...state, onlinePeers: action.peers};
  },
  ONLINE_PEER_JOINED: (state, action) => {
    if (action.type !== 'ONLINE_PEER_JOINED') return state;
    return {
      ...state,
      onlinePeers: [...state.onlinePeers, {peerId: action.peerId, name: action.name}],
      previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, online: true} : p),
    };
  },
  ONLINE_PEER_LEFT: (state, action) => {
    if (action.type !== 'ONLINE_PEER_LEFT') return state;
    return {
      ...state,
      onlinePeers: state.onlinePeers.filter(p => p.peerId !== action.peerId),
      previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, online: false} : p),
    };
  },
  PREVIOUS_PEERS_RECEIVED: (state, action) => {
    if (action.type !== 'PREVIOUS_PEERS_RECEIVED') return state;
    return {...state, previousPeers: action.peers};
  },
  PREVIOUS_PEER_CONNECTED: (state, action) => {
    if (action.type !== 'PREVIOUS_PEER_CONNECTED') return state;
    return {...state, previousPeers: state.previousPeers.filter(p => p.peerId !== action.signalingPeerId)};
  },
  FORGET_PEER: (state, action) => {
    if (action.type !== 'FORGET_PEER') return state;
    return {...state, previousPeers: state.previousPeers.filter(p => p.peerId !== action.peerId)};
  },
  EMAIL_SHARED_RECEIVED: (state, action) => {
    if (action.type !== 'EMAIL_SHARED_RECEIVED') return state;
    return {...state, previousPeers: state.previousPeers.map(p => p.peerId === action.fromPeerId ? {...p, email: action.email} : p)};
  },
  EMAIL_REVOKED_RECEIVED: (state, action) => {
    if (action.type !== 'EMAIL_REVOKED_RECEIVED') return state;
    return {...state, previousPeers: state.previousPeers.map(p =>
      p.peerId !== action.fromPeerId ? p : {peerId: p.peerId, name: p.name, online: p.online}
    )};
  },
  SAVE_PEER_EMAIL: (state, action) => {
    if (action.type !== 'SAVE_PEER_EMAIL') return state;
    return {...state, previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, email: action.email} : p)};
  },
  MESSAGE_RECEIVED: (state, action) => {
    if (action.type !== 'MESSAGE_RECEIVED') return state;
    return {...state, messages: [...state.messages, {peerId: action.peerId, text: action.text, fromSelf: false}]};
  },
  SEND_MESSAGE: (state, action) => {
    if (action.type !== 'SEND_MESSAGE') return state;
    return {...state, messages: [...state.messages, {peerId: action.peerId, text: action.text, fromSelf: true}]};
  },
  PEER_CONNECTION_UNSTABLE: (state, action) => {
    if (action.type !== 'PEER_CONNECTION_UNSTABLE') return state;
    return {...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'unstable'}};
  },
  PEER_CONNECTION_RESTORED: (state, action) => {
    if (action.type !== 'PEER_CONNECTION_RESTORED') return state;
    return {...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'stable'}};
  },
  LOAD_BOARD: (state) => ({...state, boardLoading: true}),
  BOARD_LOADED: (state, action) => {
    if (action.type !== 'BOARD_LOADED') return state;
    return {...state, board: action.board, boardLoading: false};
  },
  BOARD_NOT_FOUND: (state) => ({...state, board: null, boardLoading: false}),
  SAVE_BOARD: (state, action) => {
    if (action.type !== 'SAVE_BOARD') return state;
    return {...state, board: action.board};
  },
  GAME_STARTED: (state, action) => {
    if (action.type !== 'GAME_STARTED') return state;
    return {...state, gameState: action.gameState};
  },
  GAME_STATE: (state, action) => {
    if (action.type !== 'GAME_STATE') return state;
    return {...state, gameState: action.gameState};
  },
  FIRE_RESULT: (state, action) => {
    if (action.type !== 'FIRE_RESULT') return state;
    const gameState = state.gameState;
    if (!gameState) return state;
    const playerShots = [...gameState.playerShots, action.playerShot];
    const aiShots = action.aiShot ? [...gameState.aiShots, action.aiShot] : gameState.aiShots;
    const announcement = action.playerShot.result === 'sunk' && action.playerShot.ship
      ? `${action.playerShot.ship.name} sunk!` : '';
    return {...state, gameState: {...gameState, playerShots, aiShots, phase: action.phase, announcement}};
  },
  GAME_NOT_FOUND: (state) => ({...state, gameState: null}),
};

const coreConnectionsReducer = (state: ConnectionsState, action: ConnectionsAction): ConnectionsState =>
  maybe(coreHandlers[action.type]).map(fn => fn(state, action)).orElse(state);

const p2pGameInitial: P2pGame = {
  opponentId: '',
  phase: 'challenged',
  myBoardHash: '',
  opponentBoardHash: null,
  myShots: [],
  opponentShots: [],
  myBoardReady: false,
  opponentBoardReady: false,
  winner: null,
  opponentBoard: null,
  boardVerified: null,
  announcement: '',
};

const p2pGameHandlers: Partial<Record<ConnectionsAction['type'], (game: P2pGame | null, action: ConnectionsAction) => P2pGame | null>> = {
  CHALLENGE_PEER: (_, action) => {
    if (action.type !== 'CHALLENGE_PEER') return null;
    return {...p2pGameInitial, phase: 'challenged', opponentId: action.opponentId};
  },
  CHALLENGE_RECEIVED: (_, action) => {
    if (action.type !== 'CHALLENGE_RECEIVED') return null;
    return {...p2pGameInitial, phase: 'challenge-received', opponentId: action.opponentId};
  },
  ACCEPT_CHALLENGE: (game) => game ? {...game, phase: 'placing'} : game,
  DECLINE_CHALLENGE: () => null,
  CANCEL_CHALLENGE: () => null,
  P2P_BOARD_READY: (game, action) => {
    if (action.type !== 'P2P_BOARD_READY') return game;
    if (!game) return game;
    const updated = {...game, myBoardReady: true, myBoardHash: action.boardHash};
    return updated.opponentBoardReady ? {...updated, phase: 'selecting-turn'} : updated;
  },
  OPPONENT_BOARD_READY: (game, action) => {
    if (action.type !== 'OPPONENT_BOARD_READY') return game;
    if (!game) return game;
    const updated = {...game, opponentBoardReady: true, opponentBoardHash: action.boardHash};
    return updated.myBoardReady ? {...updated, phase: 'selecting-turn'} : updated;
  },
  TURN_ORDER_DECIDED: (game, action) => {
    if (action.type !== 'TURN_ORDER_DECIDED') return game;
    if (!game) return game;
    return {...game, phase: action.iGoFirst ? 'my-turn' : 'their-turn'};
  },
  P2P_FIRE_RESULT: (game, action) => {
    if (action.type !== 'P2P_FIRE_RESULT') return game;
    if (!game) return game;
    const announcement = action.shot.result === 'sunk' && action.shot.ship ? `${action.shot.ship.name} sunk!` : '';
    return {...game, myShots: [...game.myShots, action.shot], phase: 'their-turn', announcement};
  },
  OPPONENT_FIRED: (game, action) => {
    if (action.type !== 'OPPONENT_FIRED') return game;
    if (!game) return game;
    return {...game, opponentShots: [...game.opponentShots, action.shot], phase: 'my-turn', announcement: ''};
  },
  P2P_GAME_OVER: (game, action) => {
    if (action.type !== 'P2P_GAME_OVER') return game;
    if (!game) return game;
    return {...game, phase: 'game-over', winner: action.winner, announcement: ''};
  },
  FORFEIT_GAME: (game) => game ? {...game, phase: 'game-over', winner: 'opponent', announcement: ''} : game,
  OPPONENT_FORFEITED: (game) => game ? {...game, phase: 'game-over', winner: 'me', forfeited: true, announcement: ''} : game,
  P2P_GAME_LOADED: (game, action) => {
    if (action.type !== 'P2P_GAME_LOADED') return game;
    const resumable = action.gameState.phase === 'my-turn' || action.gameState.phase === 'their-turn';
    if (!resumable) return game;
    // winner is always null for resumable phases — the decoder strips it to avoid null/string mismatch
    const base = {...action.gameState, winner: null as P2pGame['winner']};
    // Use mapped opponentId from action when restoring from disconnected or null (refreshed peer).
    // Only preserve existing game.opponentId during challenge flow (game exists in non-disconnected phase).
    return game && game.phase !== 'disconnected' ? {...base, opponentId: game.opponentId} : base;
  },
  P2P_STATE_MISMATCH: (game) => game ? {...game, phase: 'state-mismatch'} : game,
  OPPONENT_BOARD_REVEALED: (game, action) => {
    if (action.type !== 'OPPONENT_BOARD_REVEALED') return game;
    if (!game || game.phase !== 'game-over' || game.winner !== 'me') return game;
    return {...game, opponentBoard: action.board, boardVerified: action.verified};
  },
  CLEAR_P2P_GAME: () => null,
  PEER_DISCONNECTED: (game, action) => {
    if (action.type !== 'PEER_DISCONNECTED') return game;
    if (!game || game.opponentId !== action.peerId) return game;
    if (game.phase === 'game-over' || game.phase === 'disconnected' || game.phase === 'state-mismatch') return game;
    return {...game, phase: 'disconnected'};
  },
};

const p2pGameReducer = (game: P2pGame | null, action: ConnectionsAction): P2pGame | null =>
  maybe(p2pGameHandlers[action.type]).map(fn => fn(game, action)).orElse(game);

export const connectionsReducer = (state: ConnectionsState, action: ConnectionsAction): ConnectionsState => ({
  ...coreConnectionsReducer(state, action),
  handlerState: handlerReducer(state.handlerState, action),
  p2pGame: p2pGameReducer(state.p2pGame, action),
});
