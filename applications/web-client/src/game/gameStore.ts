import {gameReducer, initialGameState} from './game';
import type {GameState, GameAction, P2pGame} from './game';
import {createGameMessageHandler} from './gameMessageHandler';
import {selectBoard, selectAiGameState, selectP2pGame, selectOffererPeerIds} from './gameSelectors';
import {gameStarted, fireResult, boardNotFound, turnOrderDecided} from './gameActions';
import {randomBoard, resolveFireShot} from './aiGame';
import {maybe, createDispatch} from '../lib/maybe';
import {createCoinFlipProtocol} from './coinFlipProtocol';
import type {CoinFlipProtocol} from './coinFlipProtocol';

export type GameListenerContext = {
  prevState: GameState
  state: GameState
  dispatch: (action: GameAction) => void
  getState: () => GameState
}

export type GameListenerFn = (action: GameAction, context: GameListenerContext) => void

export type GameStore = {
  getState: () => GameState
  subscribe: (fn: () => void) => () => void
  dispatch: (action: GameAction) => void
  addListener: (fn: GameListenerFn) => () => void
}

type Dispatch = (action: GameAction) => void

type ListenerFactoryDeps = {
  dispatch: Dispatch
  getState: () => GameState
  sendToPeer?: (peerId: string, message: unknown) => void
  sendToServer?: (message: unknown) => void
  getPeerToSignaling?: () => Record<string, string>
  coinFlip?: CoinFlipProtocol
}

export type GameListenerFactory = (deps: ListenerFactoryDeps) => GameListenerFn

type GameStoreConfig = {
  sendToPeer?: (peerId: string, message: unknown) => void
  sendToServer?: (message: unknown) => void
  listenerFactories?: GameListenerFactory[]
  translatePeerId?: (signalingId: string) => string | undefined
  getPeerToSignaling?: () => Record<string, string>
  onPeerMessage?: (handler: (peerId: string, data: unknown) => void) => void
  onPeerConnected?: (handler: (peerId: string, isOfferer: boolean) => void) => void
  onPeerNamed?: (handler: (peerId: string, name: string) => void) => void
  onPeerDisconnected?: (handler: (peerId: string) => void) => void
  onServerMessage?: (handler: (data: unknown) => void) => void
}

export const createAiGameListenerFactory: GameListenerFactory = ({dispatch, getState}) => {
  let aiBoard: ReturnType<typeof randomBoard> | null = null;

  return (action) => {
    if (action.type === 'START_GAME') {
      const board = selectBoard(getState());
      if (!board) return;
      aiBoard = randomBoard();
      dispatch(gameStarted({playerShots: [], aiShots: [], phase: 'player-turn', announcement: ''}));
      return;
    }
    if (action.type === 'FIRE_SHOT') {
      const aiGameState = selectAiGameState(getState());
      const board = selectBoard(getState());
      if (!aiGameState || !board || !aiBoard) return;
      if (aiGameState.phase !== 'player-turn') return;
      if (aiGameState.playerShots.some(s => s.cell.row === action.row && s.cell.col === action.col)) return;
      const result = resolveFireShot(aiBoard, board, aiGameState.playerShots, aiGameState.aiShots, {row: action.row, col: action.col});
      dispatch(fireResult(result.playerShot, result.aiShot, result.phase));
    }
  };
};

export const createServerBridgeListenerFactory: GameListenerFactory = ({sendToServer}) => {
  const send = (msg: unknown) => sendToServer?.(msg);
  const handlers = createDispatch<GameAction>({
    SAVE_BOARD: (action) => send({type: 'SAVE_BOARD', board: JSON.stringify(action.board)}),
    START_GAME: () => send({type: 'START_GAME'}),
    FIRE_SHOT: (action) => send({type: 'FIRE', row: action.row, col: action.col}),
    LOAD_BOARD: () => send({type: 'LOAD_BOARD'}),
    LOAD_GAME: () => send({type: 'LOAD_GAME'}),
  });
  return (action) => handlers(action);
};

export const createSaveOnShotListenerFactory: GameListenerFactory = ({getState, sendToServer, getPeerToSignaling}) =>
  (action) => {
    if (
      action.type !== 'P2P_FIRE_RESULT' &&
      action.type !== 'OPPONENT_FIRED' &&
      action.type !== 'P2P_GAME_OVER' &&
      action.type !== 'TURN_ORDER_DECIDED'
    ) return;
    const game = selectP2pGame(getState());
    if (!game) return;
    const signalingOpponentId = getPeerToSignaling?.()[game.opponentId] ?? game.opponentId;
    sendToServer?.({type: 'SAVE_P2P_GAME', opponentId: signalingOpponentId, gameState: JSON.stringify({...game, opponentId: signalingOpponentId})});
  };

export const createReconnectListenerFactory: GameListenerFactory = ({sendToPeer}) =>
  (action, {state}) => {
    if (action.type !== 'P2P_GAME_LOADED') return;
    const loadedGame = selectP2pGame(state);
    if (!loadedGame) return;
    if (loadedGame.phase !== 'my-turn' && loadedGame.phase !== 'their-turn') return;
    maybe(sendToPeer).map(send =>
      send(loadedGame.opponentId, {type: 'GAME_STATE_SYNC', myShots: loadedGame.myShots, opponentShots: loadedGame.opponentShots, phase: loadedGame.phase})
    );
  };

type GameCommandHandlers = {
  [T in GameAction['type']]?: (action: Extract<GameAction, {type: T}>, prevGame: P2pGame | null) => void
}
type AnyGameCommandHandler = (action: GameAction, prevGame: P2pGame | null) => void

export const createGameCommandListenerFactory: GameListenerFactory = ({dispatch, sendToPeer: sendToPeerFn, sendToServer, getPeerToSignaling, coinFlip}) => {
  const sendToPeer = (peerId: string, msg: unknown) => maybe(sendToPeerFn).map(send => send(peerId, msg));
  const loadSavedGame = (peerId: string) => {
    const signalingId = getPeerToSignaling?.()[peerId];
    if (sendToServer && signalingId) sendToServer({type: 'LOAD_P2P_GAME', opponentId: signalingId});
  };

  const handlers: GameCommandHandlers = {
    CHALLENGE_PEER: (action) => {
      sendToPeer(action.opponentId, {type: 'GAME_CHALLENGE'});
      loadSavedGame(action.opponentId);
    },
    ACCEPT_CHALLENGE: (_, prevGame) => {
      if (prevGame?.phase !== 'challenge-received') return;
      sendToPeer(prevGame.opponentId, {type: 'GAME_ACCEPT'});
      loadSavedGame(prevGame.opponentId);
    },
    DECLINE_CHALLENGE: (_, prevGame) => {
      if (!prevGame) return;
      sendToPeer(prevGame.opponentId, {type: 'GAME_DECLINE'});
    },
    CANCEL_CHALLENGE: (_, prevGame) => {
      if (!prevGame) return;
      sendToPeer(prevGame.opponentId, {type: 'GAME_CANCEL'});
    },
    P2P_BOARD_READY: (action, prevGame) => {
      if (!prevGame) return;
      sendToPeer(prevGame.opponentId, {type: 'BOARD_READY', boardHash: action.boardHash});
    },
    FORFEIT_GAME: (_, prevGame) => {
      if (!prevGame) return;
      sendToPeer(prevGame.opponentId, {type: 'GAME_FORFEIT'});
    },
    TAKE_FIRST_TURN: (_, prevGame) => {
      if (!prevGame) return;
      sendToPeer(prevGame.opponentId, {type: 'GAME_FIRST_TURN'});
      dispatch(turnOrderDecided(true));
    },
    CLAIM_FIRST_TURN: (_, prevGame) => {
      if (!prevGame) return;
      coinFlip?.start(prevGame.opponentId);
    },
    P2P_FIRE: (action, prevGame) => {
      if (prevGame?.phase !== 'my-turn') return;
      if (prevGame.myShots.some(s => s.cell.row === action.row && s.cell.col === action.col)) return;
      sendToPeer(prevGame.opponentId, {type: 'FIRE', row: action.row, col: action.col});
    },
    PEER_CONNECTED: (action) => {
      loadSavedGame(action.peerId);
    },
  };

  return (action, {prevState}) => {
    const prevGame = selectP2pGame(prevState);
    maybe((handlers as Record<string, AnyGameCommandHandler | undefined>)[action.type]).map(fn => fn(action, prevGame));
  };
};

const OFFLINE_FALLBACK_MS = 3_000;

export const createOfflineFallbackListenerFactory: GameListenerFactory = ({dispatch}) => {
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    dispatch(boardNotFound());
  }, OFFLINE_FALLBACK_MS);

  return (action) => {
    if (action.type === 'LOAD_BOARD' && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
};

export const createGameStore = (config?: GameStoreConfig): GameStore => {
  let state = initialGameState;
  const subscribers = new Set<() => void>();
  const actionListeners = new Set<GameListenerFn>();

  const store: GameStore = {
    getState: () => state,
    subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
    addListener: (fn) => { actionListeners.add(fn); return () => actionListeners.delete(fn); },
    dispatch: (action: GameAction) => { /* replaced below */ void action; },
  };

  const baseDispatch: Dispatch = (action) => {
    const prevState = state;
    state = gameReducer(state, action);
    subscribers.forEach(fn => fn());
    actionListeners.forEach(fn => fn(action, {prevState, state, dispatch: (a) => store.dispatch(a), getState: () => state}));
  };

  store.dispatch = baseDispatch;

  let coinFlip: CoinFlipProtocol | undefined;

  if (config?.sendToPeer) {
    coinFlip = createCoinFlipProtocol({
      sendToPeer: config.sendToPeer,
      getOffererPeerIds: () => selectOffererPeerIds(state),
      dispatch: (action) => store.dispatch(action),
    });
  }

  if (config?.sendToPeer) {
    const gameMessageHandler = createGameMessageHandler({
      dispatch: (action) => store.dispatch(action),
      getP2pGame: () => selectP2pGame(state),
      getBoard: () => selectBoard(state),
      getOffererPeerIds: () => selectOffererPeerIds(state),
      sendToPeer: config.sendToPeer,
      translatePeerId: config.translatePeerId,
    });
    if (config.onPeerConnected) config.onPeerConnected((peerId, isOfferer) => gameMessageHandler({type: 'PEER_CONNECTED', peerId, isOfferer}));
    if (config.onPeerNamed) config.onPeerNamed((peerId, name) => gameMessageHandler({type: 'PEER_NAMED', peerId, name}));
    if (config.onPeerDisconnected) config.onPeerDisconnected((peerId) => gameMessageHandler({type: 'PEER_DISCONNECTED', peerId}));
    if (config.onServerMessage) config.onServerMessage((data) => gameMessageHandler({type: 'SERVER_MESSAGE', data}));
    if (config.onPeerMessage) config.onPeerMessage((peerId, data) => {
      coinFlip?.handleMessage(peerId, data);
      gameMessageHandler({type: 'PEER_MESSAGE', peerId, data});
    });
  }

  // Listener factories invoked AFTER coin flip exists so they can capture it
  const listenerDeps: ListenerFactoryDeps = {dispatch: (action) => store.dispatch(action), getState: () => state, sendToPeer: config?.sendToPeer, sendToServer: config?.sendToServer, getPeerToSignaling: config?.getPeerToSignaling, coinFlip};
  config?.listenerFactories?.forEach(factory => store.addListener(factory(listenerDeps)));

  return store;
};
