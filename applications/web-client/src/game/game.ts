import type {Board} from './board';
import {maybe} from '../lib/maybe';

export type ShotResult = 'hit' | 'miss' | 'sunk'
export type AiGamePhase = 'player-turn' | 'computer-turn' | 'player-won' | 'computer-won'
export type Shot = {cell: {row: number; col: number}; result: ShotResult; ship?: {name: string; size: number}}
export type AiGameState = {playerShots: Shot[]; aiShots: Shot[]; phase: AiGamePhase; announcement: string}

export type P2pGamePhase =
  | 'challenged'
  | 'challenge-received'
  | 'placing'
  | 'selecting-turn'
  | 'my-turn'
  | 'their-turn'
  | 'game-over'
  | 'disconnected'
  | 'state-mismatch'

export type P2pGame = {
  opponentId: string
  phase: P2pGamePhase
  myBoardHash: string
  opponentBoardHash: string | null
  myShots: Shot[]
  opponentShots: Shot[]
  myBoardReady: boolean
  opponentBoardReady: boolean
  winner: 'me' | 'opponent' | null
  forfeited?: true
  opponentBoard: Board | null
  boardVerified: boolean | null
  announcement: string
}

export type GameView = {
  myShots: Shot[]
  opponentShots: Shot[]
  phase: 'my-turn' | 'their-turn' | 'won' | 'lost' | 'disconnected' | 'state-mismatch'
  opponentName: string
}

export type GameState = {
  board: Board | null
  boardLoading: boolean
  aiGameState: AiGameState | null
  p2pGame: P2pGame | null
  opponentNames: Record<string, string>
  offererPeerIds: string[]
}

export type GameAction =
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
  | {type: 'SAVE_P2P_GAME'}
  | {type: 'LOAD_P2P_GAME'; opponentId: string}
  | {type: 'P2P_GAME_LOADED'; gameState: P2pGame}
  | {type: 'P2P_STATE_SYNC'; opponentId: string; myShots: Shot[]; opponentShots: Shot[]; phase: P2pGamePhase}
  | {type: 'P2P_STATE_MISMATCH'}
  | {type: 'CLEAR_P2P_GAME'}
  | {type: 'OPPONENT_BOARD_REVEALED'; board: Board; verified: boolean}
  | {type: 'PEER_NAMED'; peerId: string; name: string}
  | {type: 'PEER_CONNECTED'; peerId: string; isOfferer: boolean}
  | {type: 'PEER_DISCONNECTED'; peerId: string}

export const initialGameState: GameState = {
  board: null,
  boardLoading: true,
  aiGameState: null,
  p2pGame: null,
  opponentNames: {},
  offererPeerIds: [],
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

const gameP2pHandlers: Partial<Record<GameAction['type'], (game: P2pGame | null, action: GameAction) => P2pGame | null>> = {
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
    const base = {...action.gameState, winner: null as P2pGame['winner']};
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

const p2pGameReducer = (game: P2pGame | null, action: GameAction): P2pGame | null =>
  maybe(gameP2pHandlers[action.type]).map(fn => fn(game, action)).orElse(game);

const gameHandlers: Partial<Record<GameAction['type'], (state: GameState, action: GameAction) => GameState>> = {
  LOAD_BOARD: (state) => ({...state, boardLoading: true}),
  BOARD_LOADED: (state, action) => {
    if (action.type !== 'BOARD_LOADED') return state;
    return {...state, board: action.board, boardLoading: false};
  },
  BOARD_NOT_FOUND: (state) => ({...state, boardLoading: false}),
  SAVE_BOARD: (state, action) => {
    if (action.type !== 'SAVE_BOARD') return state;
    return {...state, board: action.board};
  },
  GAME_STARTED: (state, action) => {
    if (action.type !== 'GAME_STARTED') return state;
    return {...state, aiGameState: action.gameState};
  },
  GAME_STATE: (state, action) => {
    if (action.type !== 'GAME_STATE') return state;
    return {...state, aiGameState: action.gameState};
  },
  FIRE_RESULT: (state, action) => {
    if (action.type !== 'FIRE_RESULT') return state;
    const aiGameState = state.aiGameState;
    if (!aiGameState) return state;
    const playerShots = [...aiGameState.playerShots, action.playerShot];
    const aiShots = action.aiShot ? [...aiGameState.aiShots, action.aiShot] : aiGameState.aiShots;
    const announcement = action.playerShot.result === 'sunk' && action.playerShot.ship
      ? `${action.playerShot.ship.name} sunk!` : '';
    return {...state, aiGameState: {...aiGameState, playerShots, aiShots, phase: action.phase, announcement}};
  },
  GAME_NOT_FOUND: (state) => ({...state, aiGameState: null}),
  PEER_NAMED: (state, action) => {
    if (action.type !== 'PEER_NAMED') return state;
    return {...state, opponentNames: {...state.opponentNames, [action.peerId]: action.name}};
  },
  PEER_CONNECTED: (state, action) => {
    if (action.type !== 'PEER_CONNECTED') return state;
    if (!action.isOfferer) return state;
    return {...state, offererPeerIds: [...state.offererPeerIds, action.peerId]};
  },
};

export const gameReducer = (state: GameState, action: GameAction): GameState =>
  maybe(gameHandlers[action.type])
    .map(fn => fn(state, action))
    .orElse({...state, p2pGame: p2pGameReducer(state.p2pGame, action)});
