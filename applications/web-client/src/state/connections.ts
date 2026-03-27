import type {Board} from '../game/board';
import type {Shot, P2pGamePhase, P2pGame, AiGamePhase as GamePhase, AiGameState as GameState} from '../game/game';

export type {ShotResult, Shot, P2pGamePhase, P2pGame, GameView} from '../game/game';
export type {AiGamePhase as GamePhase, AiGameState as GameState} from '../game/game';

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
  gameState: GameState | null
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
  | {type: 'GAME_STARTED'; gameState: GameState}
  | {type: 'FIRE_SHOT'; row: number; col: number}
  | {type: 'FIRE_RESULT'; playerShot: Shot; aiShot: Shot | null; phase: GamePhase}
  | {type: 'LOAD_GAME'}
  | {type: 'GAME_STATE'; gameState: GameState}
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
  | {type: 'SAVE_P2P_GAME'}
  | {type: 'LOAD_P2P_GAME'; opponentId: string}
  | {type: 'P2P_GAME_LOADED'; gameState: P2pGame}
  | {type: 'P2P_STATE_SYNC'; opponentId: string; myShots: Shot[]; opponentShots: Shot[]; phase: P2pGamePhase}
  | {type: 'P2P_STATE_MISMATCH'}
  | {type: 'CLEAR_P2P_GAME'}
  | {type: 'OPPONENT_BOARD_REVEALED'; board: Board; verified: boolean}

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
    case 'INTRO_CHANNEL_REGISTERED':
      return {...state, introChannels: {...state.introChannels, [action.introId]: action.relayPeerId}};
    case 'INTRO_CONNECTION_REGISTERED':
      return {...state, introConnections: {...state.introConnections, [action.introId]: action.newPeerId}};
    case 'INTRO_CONNECTION_CLEARED':
      return {
        ...state,
        introConnections: Object.fromEntries(Object.entries(state.introConnections).filter(([k]) => k !== action.introId)),
      };
    case 'ACCEPT_INTRODUCTION':
    case 'DECLINE_INTRODUCTION':
      return {
        ...state,
        introChannels: Object.fromEntries(Object.entries(state.introChannels).filter(([k]) => k !== action.introId)),
      };
    case 'PEER_DISCONNECTED': {
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
    case 'CANCEL_OFFER':
      return {...state, flow: {phase: 'idle'}};

    case 'OFFER_FAILED':
      return {...state, flow: {phase: 'offer-failed'}};

    case 'PEER_CONNECTED':
      return {
        ...state,
        flow: 'peerId' in state.flow && state.flow.peerId === action.peerId ? {phase: 'idle' as const} : state.flow,
        peers: [...state.peers, {id: action.peerId}],
      };

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

    case 'SAVE_PEER_EMAIL':
      return {...state, previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, email: action.email} : p)};

    case 'MESSAGE_RECEIVED':
      return {...state, messages: [...state.messages, {peerId: action.peerId, text: action.text, fromSelf: false}]};

    case 'SEND_MESSAGE':
      return {...state, messages: [...state.messages, {peerId: action.peerId, text: action.text, fromSelf: true}]};

    case 'PEER_CONNECTION_UNSTABLE':
      return {...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'unstable'}};

    case 'PEER_CONNECTION_RESTORED':
      return {...state, peerConnectionHealth: {...state.peerConnectionHealth, [action.peerId]: 'stable'}};

    case 'LOAD_BOARD':
      return {...state, boardLoading: true};

    case 'BOARD_LOADED':
      return {...state, board: action.board, boardLoading: false};

    case 'BOARD_NOT_FOUND':
      return {...state, board: null, boardLoading: false};

    case 'SAVE_BOARD':
      return {...state, board: action.board};

    case 'GAME_STARTED':
    case 'GAME_STATE':
      return {...state, gameState: action.gameState};

    case 'FIRE_RESULT': {
      const gameState = state.gameState;
      if (!gameState) return state;
      const playerShots = [...gameState.playerShots, action.playerShot];
      const aiShots = action.aiShot ? [...gameState.aiShots, action.aiShot] : gameState.aiShots;
      const announcement = action.playerShot.result === 'sunk' && action.playerShot.ship
        ? `${action.playerShot.ship.name} sunk!` : '';
      return {...state, gameState: {...gameState, playerShots, aiShots, phase: action.phase, announcement}};
    }

    case 'GAME_NOT_FOUND':
      return {...state, gameState: null};

    default:
      return state;
  }
};

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

const p2pGameReducer = (game: P2pGame | null, action: ConnectionsAction): P2pGame | null => {
  switch (action.type) {
    case 'CHALLENGE_PEER':
      return {...p2pGameInitial, phase: 'challenged', opponentId: action.opponentId};

    case 'CHALLENGE_RECEIVED':
      return {...p2pGameInitial, phase: 'challenge-received', opponentId: action.opponentId};

    case 'ACCEPT_CHALLENGE':
      if (!game) return game;
      return {...game, phase: 'placing'};

    case 'DECLINE_CHALLENGE':
    case 'CANCEL_CHALLENGE':
      return null;

    case 'P2P_BOARD_READY': {
      if (!game) return game;
      const updated = {...game, myBoardReady: true, myBoardHash: action.boardHash};
      return updated.opponentBoardReady ? {...updated, phase: 'selecting-turn'} : updated;
    }

    case 'OPPONENT_BOARD_READY': {
      if (!game) return game;
      const updated = {...game, opponentBoardReady: true, opponentBoardHash: action.boardHash};
      return updated.myBoardReady ? {...updated, phase: 'selecting-turn'} : updated;
    }

    case 'TURN_ORDER_DECIDED':
      if (!game) return game;
      return {...game, phase: action.iGoFirst ? 'my-turn' : 'their-turn'};

    case 'P2P_FIRE_RESULT': {
      if (!game) return game;
      const announcement = action.shot.result === 'sunk' && action.shot.ship ? `${action.shot.ship.name} sunk!` : '';
      return {...game, myShots: [...game.myShots, action.shot], phase: 'their-turn', announcement};
    }

    case 'OPPONENT_FIRED':
      if (!game) return game;
      return {...game, opponentShots: [...game.opponentShots, action.shot], phase: 'my-turn', announcement: ''};

    case 'P2P_GAME_OVER':
      if (!game) return game;
      return {...game, phase: 'game-over', winner: action.winner, announcement: ''};

    case 'FORFEIT_GAME':
      if (!game) return game;
      return {...game, phase: 'game-over', winner: 'opponent', announcement: ''};

    case 'OPPONENT_FORFEITED':
      if (!game) return game;
      return {...game, phase: 'game-over', winner: 'me', forfeited: true, announcement: ''};

    case 'P2P_GAME_LOADED': {
      const resumable = action.gameState.phase === 'my-turn' || action.gameState.phase === 'their-turn';
      if (!resumable) return game;
      // winner is always null for resumable phases — the decoder strips it to avoid null/string mismatch
      const base = {...action.gameState, winner: null as P2pGame['winner']};
      // Use mapped opponentId from action when restoring from disconnected or null (refreshed peer).
      // Only preserve existing game.opponentId during challenge flow (game exists in non-disconnected phase).
      return game && game.phase !== 'disconnected' ? {...base, opponentId: game.opponentId} : base;
    }

    case 'P2P_STATE_MISMATCH':
      if (!game) return game;
      return {...game, phase: 'state-mismatch'};

    case 'OPPONENT_BOARD_REVEALED':
      if (!game || game.phase !== 'game-over' || game.winner !== 'me') return game;
      return {...game, opponentBoard: action.board, boardVerified: action.verified};

    case 'CLEAR_P2P_GAME':
      return null;

    case 'PEER_DISCONNECTED':
      if (!game || game.opponentId !== action.peerId) return game;
      if (game.phase === 'game-over' || game.phase === 'disconnected' || game.phase === 'state-mismatch') return game;
      return {...game, phase: 'disconnected'};

    default:
      return game;
  }
};

export const connectionsReducer = (state: ConnectionsState, action: ConnectionsAction): ConnectionsState => ({
  ...coreConnectionsReducer(state, action),
  handlerState: handlerReducer(state.handlerState, action),
  p2pGame: p2pGameReducer(state.p2pGame, action),
});
