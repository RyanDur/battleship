import type {Board} from './board';

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
  boardLoading: false,
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

const p2pGameReducer = (game: P2pGame | null, action: GameAction): P2pGame | null => {
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
      const base = {...action.gameState, winner: null as P2pGame['winner']};
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

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
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
      return {...state, aiGameState: action.gameState};
    case 'FIRE_RESULT': {
      const aiGameState = state.aiGameState;
      if (!aiGameState) return state;
      const playerShots = [...aiGameState.playerShots, action.playerShot];
      const aiShots = action.aiShot ? [...aiGameState.aiShots, action.aiShot] : aiGameState.aiShots;
      const announcement = action.playerShot.result === 'sunk' && action.playerShot.ship
        ? `${action.playerShot.ship.name} sunk!` : '';
      return {...state, aiGameState: {...aiGameState, playerShots, aiShots, phase: action.phase, announcement}};
    }
    case 'GAME_NOT_FOUND':
      return {...state, aiGameState: null};
    case 'PEER_NAMED':
      return {...state, opponentNames: {...state.opponentNames, [action.peerId]: action.name}};
    case 'PEER_CONNECTED':
      if (!action.isOfferer) return state;
      return {...state, offererPeerIds: [...state.offererPeerIds, action.peerId]};
    default:
      return {...state, p2pGame: p2pGameReducer(state.p2pGame, action)};
  }
};
