import {gameReducer, initialGameState} from './game';
import type {GameState, GameAction, P2pGame} from './game';
import type {ConnectionPort} from '../connections/connectionPort';
import type {ConnectionsAction} from '../connections/connections';
import {createGameMessageHandler} from './gameMessageHandler';
import {selectBoard, selectAiGameState, selectP2pGame, selectOffererPeerIds} from './gameSelectors';
import {gameStarted, fireResult, boardNotFound, turnOrderDecided} from './gameActions';
import {saveP2pGame, loadP2pGame, saveBoard as connectionSaveBoard, startGame as connectionStartGame} from '../connections/connectionActions';
import {randomBoard, resolveFireShot} from './aiGame';
import {maybe} from '../lib/maybe';

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
  port?: ConnectionPort
  dispatchToConnection?: (action: ConnectionsAction) => void
  getPeerToSignaling?: () => Record<string, string>
}

export type GameListenerFactory = (deps: ListenerFactoryDeps) => GameListenerFn

type GameStoreConfig = {
  port?: ConnectionPort
  listenerFactories?: GameListenerFactory[]
  translatePeerId?: (signalingId: string) => string | undefined
  dispatchToConnection?: (action: ConnectionsAction) => void
  getPeerToSignaling?: () => Record<string, string>
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

export const createSignalingBridgeListenerFactory: GameListenerFactory = ({dispatchToConnection}) =>
  (action) => {
    if (action.type === 'SAVE_BOARD' && dispatchToConnection) dispatchToConnection(connectionSaveBoard(action.board));
    if (action.type === 'START_GAME' && dispatchToConnection) dispatchToConnection(connectionStartGame());
  };

export const createSaveOnShotListenerFactory: GameListenerFactory = ({getState, dispatchToConnection}) =>
  (action) => {
    if (
      action.type !== 'P2P_FIRE_RESULT' &&
      action.type !== 'OPPONENT_FIRED' &&
      action.type !== 'P2P_GAME_OVER' &&
      action.type !== 'TURN_ORDER_DECIDED'
    ) return;
    const game = selectP2pGame(getState());
    if (game && dispatchToConnection) dispatchToConnection(saveP2pGame(game));
  };

export const createReconnectListenerFactory: GameListenerFactory = ({port}) =>
  (action, {state}) => {
    if (action.type !== 'P2P_GAME_LOADED') return;
    const loadedGame = selectP2pGame(state);
    if (!loadedGame) return;
    if (loadedGame.phase !== 'my-turn' && loadedGame.phase !== 'their-turn') return;
    maybe(port?.sendToPeer).map(send =>
      send(loadedGame.opponentId, {type: 'GAME_STATE_SYNC', myShots: loadedGame.myShots, opponentShots: loadedGame.opponentShots, phase: loadedGame.phase})
    );
  };

type GameCommandHandlers = {
  [T in GameAction['type']]?: (action: Extract<GameAction, {type: T}>, prevGame: P2pGame | null) => void
}
type AnyGameCommandHandler = (action: GameAction, prevGame: P2pGame | null) => void

export const createGameCommandListenerFactory: GameListenerFactory = ({dispatch, port, dispatchToConnection, getPeerToSignaling}) => {
  const sendToPeer = (peerId: string, msg: unknown) => maybe(port?.sendToPeer).map(send => send(peerId, msg));
  const loadSavedGame = (peerId: string) => {
    const signalingId = getPeerToSignaling?.()[peerId];
    if (dispatchToConnection && signalingId) dispatchToConnection(loadP2pGame(signalingId));
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
    P2P_FIRE: (action, prevGame) => {
      if (prevGame?.phase !== 'my-turn') return;
      if (prevGame.myShots.some(s => s.cell.row === action.row && s.cell.col === action.col)) return;
      sendToPeer(prevGame.opponentId, {type: 'FIRE', row: action.row, col: action.col});
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

  const listenerDeps: ListenerFactoryDeps = {dispatch: (action) => store.dispatch(action), getState: () => state, port: config?.port, dispatchToConnection: config?.dispatchToConnection, getPeerToSignaling: config?.getPeerToSignaling};
  config?.listenerFactories?.forEach(factory => store.addListener(factory(listenerDeps)));

  if (config?.port) {
    const gameMessageHandler = createGameMessageHandler({
      dispatch: (action) => store.dispatch(action),
      getP2pGame: () => selectP2pGame(state),
      getBoard: () => selectBoard(state),
      getOffererPeerIds: () => selectOffererPeerIds(state),
      sendToPeer: config.port.sendToPeer,
      translatePeerId: config.translatePeerId,
    });
    config.port.subscribe(gameMessageHandler);
  }

  return store;
};
