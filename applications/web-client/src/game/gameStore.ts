import {gameReducer, initialGameState} from './game';
import type {GameState, GameAction} from './game';
import type {ConnectionPort} from '../connections/connectionPort';
import type {ConnectionsAction} from '../connections/connections';
import {createGameMessageHandler} from './gameMessageHandler';
import {selectBoard, selectAiGameState, selectP2pGame, selectOffererPeerIds} from './gameSelectors';
import {gameStarted, fireResult, boardNotFound} from './gameActions';
import {saveP2pGame} from '../connections/connectionActions';
import {randomBoard, resolveFireShot} from './aiGame';

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
}

export type GameListenerFactory = (deps: ListenerFactoryDeps) => GameListenerFn

type GameStoreConfig = {
  port?: ConnectionPort
  listenerFactories?: GameListenerFactory[]
  translatePeerId?: (signalingId: string) => string | undefined
  dispatchToConnection?: (action: ConnectionsAction) => void
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

export const createSaveOnShotListenerFactory: GameListenerFactory = ({getState, dispatchToConnection}) =>
  (action) => {
    if (
      action.type !== 'P2P_FIRE_RESULT' &&
      action.type !== 'OPPONENT_FIRED' &&
      action.type !== 'P2P_GAME_OVER'
    ) return;
    const game = selectP2pGame(getState());
    if (game && dispatchToConnection) dispatchToConnection(saveP2pGame(game));
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

  const listenerDeps: ListenerFactoryDeps = {dispatch: (action) => store.dispatch(action), getState: () => state, port: config?.port, dispatchToConnection: config?.dispatchToConnection};
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
