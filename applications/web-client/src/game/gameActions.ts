import type {AiGameState, Shot, AiGamePhase, P2pGame, P2pGamePhase} from './game';
import type {AiDifficulty} from './aiGame';
import type {Board} from './board';

export const saveBoard = (board: Board) => ({type: 'SAVE_BOARD' as const, board});
export const boardSaved = () => ({type: 'BOARD_SAVED' as const});
export const loadBoard = () => ({type: 'LOAD_BOARD' as const});
export const boardLoaded = (board: Board) => ({type: 'BOARD_LOADED' as const, board});
export const boardNotFound = () => ({type: 'BOARD_NOT_FOUND' as const});

export const startGame = (difficulty: AiDifficulty = 'easy') => ({type: 'START_GAME' as const, difficulty});
export const gameStarted = (gameState: AiGameState) => ({type: 'GAME_STARTED' as const, gameState});
export const fireShot = (row: number, col: number) => ({type: 'FIRE_SHOT' as const, row, col});
export const fireResult = (playerShot: Shot, aiShot: Shot | null, phase: AiGamePhase) =>
  ({type: 'FIRE_RESULT' as const, playerShot, aiShot, phase});
export const loadGame = () => ({type: 'LOAD_GAME' as const});
export const gameStateReceived = (gameState: AiGameState) => ({type: 'GAME_STATE' as const, gameState});
export const gameNotFound = () => ({type: 'GAME_NOT_FOUND' as const});

export const challengePeer = (opponentId: string) => ({type: 'CHALLENGE_PEER' as const, opponentId});
export const challengeReceived = (opponentId: string) => ({type: 'CHALLENGE_RECEIVED' as const, opponentId});
export const acceptChallenge = () => ({type: 'ACCEPT_CHALLENGE' as const});
export const declineChallenge = () => ({type: 'DECLINE_CHALLENGE' as const});
export const cancelChallenge = () => ({type: 'CANCEL_CHALLENGE' as const});
export const p2pBoardReady = (boardHash: string) => ({type: 'P2P_BOARD_READY' as const, boardHash});
export const opponentBoardReady = (boardHash: string) => ({type: 'OPPONENT_BOARD_READY' as const, boardHash});
export const claimFirstTurn = () => ({type: 'CLAIM_FIRST_TURN' as const});
export const takeFirstTurn = () => ({type: 'TAKE_FIRST_TURN' as const});
export const turnOrderDecided = (iGoFirst: boolean) => ({type: 'TURN_ORDER_DECIDED' as const, iGoFirst});
export const p2pFire = (row: number, col: number) => ({type: 'P2P_FIRE' as const, row, col});
export const p2pFireResult = (shot: Shot) => ({type: 'P2P_FIRE_RESULT' as const, shot});
export const opponentFired = (shot: Shot) => ({type: 'OPPONENT_FIRED' as const, shot});
export const p2pGameOver = (winner: 'me' | 'opponent') => ({type: 'P2P_GAME_OVER' as const, winner});
export const forfeitGame = () => ({type: 'FORFEIT_GAME' as const});
export const opponentForfeited = () => ({type: 'OPPONENT_FORFEITED' as const});
export const saveP2pGame = () => ({type: 'SAVE_P2P_GAME' as const});
export const loadP2pGame = (opponentId: string) => ({type: 'LOAD_P2P_GAME' as const, opponentId});
export const p2pGameLoaded = (gameState: P2pGame) => ({type: 'P2P_GAME_LOADED' as const, gameState});
export const p2pStateSync = (opponentId: string, myShots: Shot[], opponentShots: Shot[], phase: P2pGamePhase) =>
  ({type: 'P2P_STATE_SYNC' as const, opponentId, myShots, opponentShots, phase});
export const p2pStateMismatch = () => ({type: 'P2P_STATE_MISMATCH' as const});
export const clearP2pGame = () => ({type: 'CLEAR_P2P_GAME' as const});
export const coinFlipFailed = () => ({type: 'COIN_FLIP_FAILED' as const});
export const p2pGameLoadFailed = () => ({type: 'P2P_GAME_LOAD_FAILED' as const});
export const opponentBoardRevealed = (board: Board, verified: 'verified' | 'mismatch' | 'error') => ({type: 'OPPONENT_BOARD_REVEALED' as const, board, verified});

export const peerNamed = (peerId: string, name: string) => ({type: 'PEER_NAMED' as const, peerId, name});
export const peerConnected = (peerId: string, isOfferer: boolean) => ({type: 'PEER_CONNECTED' as const, peerId, isOfferer});
export const peerDisconnected = (peerId: string) => ({type: 'PEER_DISCONNECTED' as const, peerId});
