import {gameReducer, initialGameState} from './game';
import type {GameState, GameAction} from './game';
import type {ConnectionPort} from '../connections/connectionPort';
import {createGameMessageHandler} from './gameMessageHandler';
import {selectBoard, selectP2pGame, selectOffererPeerIds} from './gameSelectors';

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
}

export type GameListenerFactory = (deps: ListenerFactoryDeps) => GameListenerFn

type GameStoreConfig = {
  port?: ConnectionPort
  listenerFactories?: GameListenerFactory[]
  translatePeerId?: (signalingId: string) => string | undefined
}

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

  const listenerDeps: ListenerFactoryDeps = {dispatch: (action) => store.dispatch(action), getState: () => state, port: config?.port};
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
