import * as Decoder from 'schemawax';
import {connectionsReducer, initialState} from './connections';
import type {ConnectionsState, ConnectionsAction} from './connections';
import type {P2pGame} from '../game/game';
import {tryCatch} from '../lib/result';
import {createDispatch} from '../lib/maybe';
import {selectFlow, selectIntroChannels, selectIsCreatingOffer, selectOffererPeerIds, selectPeerToSignaling, selectSignalingToPeer} from './connectionSelectors';
import {selectP2pGame as selectGameStoreP2pGame} from '../game/gameSelectors';
import type {GameState, GameAction} from '../game/game';
import {peerDisconnected as gamePeerDisconnected, saveBoard as gameSaveBoard, startGame as gameStartGame, clearP2pGame as gameClearP2pGame, p2pGameLoaded as gameP2pGameLoaded} from '../game/gameActions';
import {peerConnected, previousPeerConnected, peerNamed, peerDisconnected, peerTrustUpdated, offerSdpReady, answerSdpReady, introductionReceived, introductionResolved, relayOffer, relayAnswer, peerConnectionUnstable, peerConnectionRestored, relayIceRestart, relayIceRestartAnswer, offerFailed, offerEncoded, answerEncoded, acceptOffer, decodeFailed, acceptAnswer, onlinePeersUpdated, onlinePeerJoined, onlinePeerLeft, serverOfferReceived, serverAnswerReceived, previousPeersReceived, iceRestartReceived, iceRestartAnswerReceived, emailSharedReceived, emailRevokedReceived, messageReceived, boardSaved, boardLoaded, boardNotFound, gameStarted, fireResult, gameStateReceived, gameNotFound, loadBoard, loadGame, loadP2pGame} from './connectionActions';
import type {PeerEvent} from './connectionHandler';
import {encodeConnectionCode, decodeConnectionCode} from './connectionCode';
import {createPeerHandler} from './connectionHandler';
import {startSignaling} from './signaling';
import type {ConnectionEvent} from './connectionPort';
import type {SignalingConfig, SignalingEvent, SignalingHandle} from './signaling';

export type ListenerContext = {
  prevState: ConnectionsState
  state: ConnectionsState
  dispatch: (action: ConnectionsAction) => void
  getState: () => ConnectionsState
}

export type ListenerFn = (action: ConnectionsAction, context: ListenerContext) => void

export type ConnectionStore = {
  getState: () => ConnectionsState
  subscribe: (fn: () => void) => () => void
  dispatch: (action: ConnectionsAction) => void
  addListener: (fn: ListenerFn) => () => void
}

type Dispatch = (action: ConnectionsAction) => void

type MiddlewareDeps = {
  dispatch: Dispatch
  getState: () => ConnectionsState
}

export type MiddlewareFactory = (deps: MiddlewareDeps) => (next: Dispatch) => Dispatch

type ListenerFactoryDeps = {
  dispatch: Dispatch
  getState: () => ConnectionsState
}

export type ListenerFactory = (deps: ListenerFactoryDeps) => ListenerFn

export const applyMiddleware = (factories: MiddlewareFactory[]): MiddlewareFactory =>
  (deps) => (next) =>
    factories.reduceRight((acc, factory) => factory(deps)(acc), next);

export const createConnectionStore = (middlewareFactory?: MiddlewareFactory, listenerFactories?: ListenerFactory[]): ConnectionStore => {
  let state = initialState;
  const subscribers = new Set<() => void>();
  const actionListeners = new Set<ListenerFn>();

  const store: ConnectionStore = {
    getState: () => state,
    subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
    addListener: (fn) => { actionListeners.add(fn); return () => actionListeners.delete(fn); },
    dispatch: (action: ConnectionsAction) => { /* replaced below */ void action; },
  };

  const baseDispatch: Dispatch = (action) => {
    const prevState = state;
    state = connectionsReducer(state, action);
    subscribers.forEach(fn => fn());
    actionListeners.forEach(fn => fn(action, {prevState, state, dispatch: (a) => store.dispatch(a), getState: () => state}));
  };

  const middlewareAPI: MiddlewareDeps = {dispatch: (action) => store.dispatch(action), getState: () => state};
  store.dispatch = middlewareFactory ? middlewareFactory(middlewareAPI)(baseDispatch) : baseDispatch;

  const listenerDeps: ListenerFactoryDeps = {dispatch: (action) => store.dispatch(action), getState: () => state};
  listenerFactories?.forEach(factory => store.addListener(factory(listenerDeps)));

  return store;
};

type HandlerListenerConfig = {
  name: string
  createPeerConnection: () => RTCPeerConnection
  portEmit?: (event: ConnectionEvent) => void
  getGameState?: () => GameState
  dispatchToGame?: (action: GameAction) => void
}

const makeHandlerEmit = (dispatch: Dispatch, getState: () => ConnectionsState, portEmit?: (event: ConnectionEvent) => void) => {
  const dispatchPeerEvent = createDispatch<PeerEvent>({
    PEER_CONNECTED: (event) => {
      dispatch(peerConnected(event.peerId));
      if (selectOffererPeerIds(getState()).includes(event.peerId)) {
        const signalingPeerId = selectPeerToSignaling(getState())[event.peerId];
        if (signalingPeerId) dispatch(previousPeerConnected(signalingPeerId));
      }
      // Reconnect: load any saved game for this peer from the server
      const signalingPeerId = selectPeerToSignaling(getState())[event.peerId];
      if (signalingPeerId) dispatch(loadP2pGame(signalingPeerId));
      portEmit?.({type: 'PEER_CONNECTED', peerId: event.peerId, isOfferer: selectOffererPeerIds(getState()).includes(event.peerId)});
    },
    PEER_NAMED: (event) => {
      dispatch(peerNamed(event.peerId, event.name));
      portEmit?.({type: 'PEER_NAMED', peerId: event.peerId, name: event.name});
    },
    PEER_DISCONNECTED: (event) => dispatch(peerDisconnected(event.peerId)),
    PEER_TRUST_UPDATED: (event) => dispatch(peerTrustUpdated(event.peerId, event.trusts)),
    OFFER_CREATED: (event) => dispatch(offerSdpReady(event.peerId, event.sdp)),
    ANSWER_CREATED: (event) => dispatch(answerSdpReady(event.sdp)),
    INTRODUCTION_RECEIVED: (event) => dispatch(introductionReceived(event.introId, event.from, event.peer)),
    INTRODUCTION_DECLINED: (event) => dispatch(introductionResolved(event.introId)),
    INTRODUCTION_EXPIRED: (event) => dispatch(introductionResolved(event.introId)),
    SERVER_OFFER_CREATED: (event) => dispatch(relayOffer(event.signalingPeerId, event.sdp)),
    SERVER_ANSWER_CREATED: (event) => dispatch(relayAnswer(event.signalingPeerId, event.sdp)),
    PEER_CONNECTION_UNSTABLE: (event) => dispatch(peerConnectionUnstable(event.peerId)),
    PEER_CONNECTION_RESTORED: (event) => dispatch(peerConnectionRestored(event.peerId)),
    ICE_RESTART_OFFER_CREATED: (event) => dispatch(relayIceRestart(event.signalingPeerId, event.sdp)),
    ICE_RESTART_ANSWER_CREATED: (event) => dispatch(relayIceRestartAnswer(event.signalingPeerId, event.sdp)),
    MESSAGE_RECEIVED: (event) => dispatch(messageReceived(event.peerId, event.text)),
    ERROR: () => { if (selectIsCreatingOffer(getState())) dispatch(offerFailed()); },
  });
  return (event: PeerEvent) => dispatchPeerEvent(event);
};

export const createHandlerListener = ({name, createPeerConnection, portEmit, getGameState, dispatchToGame}: HandlerListenerConfig): ListenerFactory =>
  ({dispatch, getState}) => {
    const emit = makeHandlerEmit(dispatch, getState, portEmit);
    const handler = createPeerHandler({name, createPeerConnection, emit, emitToPort: portEmit ?? (() => {}), dispatch, getState});

    // Read game state from game store when available, fall back to connection store for backwards compatibility
    const getGame = () => getGameState ? selectGameStoreP2pGame(getGameState()) : null;

    const dispatchGameBridge = createDispatch<ConnectionsAction>({
      SAVE_BOARD: (action) => { if (dispatchToGame) dispatchToGame(gameSaveBoard(action.board)); },
      START_GAME: () => { if (dispatchToGame) dispatchToGame(gameStartGame()); },
      CLEAR_P2P_GAME: () => { if (dispatchToGame) dispatchToGame(gameClearP2pGame()); },
    });

    return (action, {prevState}) => {
      dispatchGameBridge(action);

      const dispatchHandlerCommand = createDispatch<ConnectionsAction>({
        CREATE_OFFER: () => handler.handleCommand({type: 'CREATE_OFFER'}),
        ACCEPT_OFFER: (action) => handler.handleCommand({type: 'ACCEPT_OFFER', sdp: action.sdp}),
        ACCEPT_ANSWER: (action) => handler.handleCommand({type: 'ACCEPT_ANSWER', peerId: action.peerId, sdp: action.sdp}),
        DISCONNECT: (action) => handler.handleCommand({type: 'DISCONNECT', peerId: action.peerId}),
        GRANT_TRUST: (action) => handler.handleCommand({type: 'GRANT_TRUST', peerId: action.peerId}),
        REVOKE_TRUST: (action) => handler.handleCommand({type: 'REVOKE_TRUST', peerId: action.peerId}),
        INTRODUCE_PEERS: (action) => handler.handleCommand({type: 'INTRODUCE_PEERS', peerId1: action.peerId1, peerId2: action.peerId2}),
        ACCEPT_INTRODUCTION: (action) => handler.handleCommand({type: 'ACCEPT_INTRODUCTION', introId: action.introId, relayPeerId: selectIntroChannels(prevState)[action.introId]}),
        DECLINE_INTRODUCTION: (action) => handler.handleCommand({type: 'DECLINE_INTRODUCTION', introId: action.introId, relayPeerId: selectIntroChannels(prevState)[action.introId]}),
        CONNECT_VIA_SERVER: (action) => handler.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: action.signalingPeerId, name: action.name}),
        RECONNECT_VIA_SERVER: (action) => handler.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: action.signalingPeerId, name: action.name}),
        SERVER_OFFER_RECEIVED: (action) => handler.handleCommand({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: action.signalingPeerId, name: action.name, sdp: action.sdp}),
        SERVER_ANSWER_RECEIVED: (action) => handler.handleCommand({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp}),
        ICE_RESTART_RECEIVED: (action) => handler.handleCommand({type: 'ICE_RESTART_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp}),
        ICE_RESTART_ANSWER_RECEIVED: (action) => handler.handleCommand({type: 'ICE_RESTART_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp}),
        SEND_MESSAGE: (action) => handler.handleCommand({type: 'SEND_MESSAGE', peerId: action.peerId, text: action.text}),
        SEND_TO_PEER: (action) => handler.handleCommand({type: 'SEND_TO_PEER', peerId: action.peerId, message: action.message}),
        PEER_DISCONNECTED: (action) => {
          handler.cleanup(action.peerId);
          dispatchToGame?.(gamePeerDisconnected(action.peerId));
        },
      });

      if (dispatchHandlerCommand(action)) return;

      const game = getGame();
      const opponentId = game?.opponentId ?? null;

      const dispatchGameAction = createDispatch<ConnectionsAction>({
        TAKE_FIRST_TURN: (a) => { dispatchToGame?.(a); },
        CLAIM_FIRST_TURN: () => {
          if (!opponentId) return;
          handler.handleCommand({type: 'START_COIN_FLIP', peerId: opponentId});
        },
        COIN_FLIP_COMMIT: (a) => { dispatchToGame?.(a); },
        COIN_FLIP_REVEAL: (a) => { dispatchToGame?.(a); },
        P2P_FIRE: (a) => { dispatchToGame?.(a); },
        TURN_ORDER_DECIDED: (a) => { dispatchToGame?.(a); },
      });
      dispatchGameAction(action);
    };
  };


export const encodingMiddleware: MiddlewareFactory =
  ({dispatch, getState}) => (next) =>
    (action: ConnectionsAction) => {
      const flow = selectFlow(getState());
      if (action.type === 'OFFER_SDP_READY' && flow.phase === 'creating') {
        encodeConnectionCode(action.sdp, flow.passphrase).onSuccess(code => dispatch(offerEncoded(action.peerId, code)));
      } else if (action.type === 'ANSWER_SDP_READY' && flow.phase === 'joining') {
        encodeConnectionCode(action.sdp, flow.passphrase).onSuccess(code => dispatch(answerEncoded(code)));
      }
      next(action);
    };

export const codecMiddleware: MiddlewareFactory =
  ({dispatch, getState}) => (next) =>
    (action: ConnectionsAction) => {
      if (action.type === 'JOIN_OFFER') {
        decodeConnectionCode(action.code, action.passphrase)
          .onSuccess(sdp => dispatch(acceptOffer(sdp)))
          .onFailure(() => dispatch(decodeFailed()));
      } else if (action.type === 'ACCEPT_ANSWER_CODE') {
        const flow = selectFlow(getState());
        if (flow.phase === 'offer-ready') {
          decodeConnectionCode(action.responseCode, flow.passphrase)
            .onSuccess(sdp => dispatch(acceptAnswer(flow.peerId, sdp)));
        }
      }
      next(action);
    };

const p2pCellDecoder = Decoder.object({required: {row: Decoder.number, col: Decoder.number}});
const p2pShipDecoder = Decoder.object({required: {name: Decoder.string, size: Decoder.number}});
const shotResultDecoder = Decoder.oneOf(Decoder.literal('hit'), Decoder.literal('miss'), Decoder.literal('sunk'));
const p2pShotDecoder = Decoder.object({
  required: {cell: p2pCellDecoder, result: shotResultDecoder},
  optional: {ship: p2pShipDecoder},
});
const p2pPhaseDecoder = Decoder.oneOf(
  Decoder.literal('challenged'),
  Decoder.literal('challenge-received'),
  Decoder.literal('placing'),
  Decoder.literal('selecting-turn'),
  Decoder.literal('my-turn'),
  Decoder.literal('their-turn'),
  Decoder.literal('game-over'),
  Decoder.literal('disconnected'),
  Decoder.literal('state-mismatch'),
);
const p2pGameStateDecoder = Decoder.object({
  required: {
    opponentId: Decoder.string,
    phase: p2pPhaseDecoder,
    myBoardHash: Decoder.string,
    myShots: Decoder.array(p2pShotDecoder),
    opponentShots: Decoder.array(p2pShotDecoder),
    myBoardReady: Decoder.boolean,
    opponentBoardReady: Decoder.boolean,
  },
  optional: {
    opponentBoardHash: Decoder.string,
  },
});

type SignalingListenerConfig = {
  config: SignalingConfig
  portEmit?: (event: ConnectionEvent) => void
  dispatchToGame?: (action: GameAction) => void
}

export const createSignalingListener = ({config, portEmit, dispatchToGame}: SignalingListenerConfig): ListenerFactory =>
  ({dispatch, getState}) => {
    let handle: SignalingHandle | null = null;

    const dispatchSignalingEvent = createDispatch<SignalingEvent>({
      REGISTERED: () => {
        dispatch(loadBoard());
        dispatch(loadGame());
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'REGISTERED'}});
      },
      PEERS: (event) => dispatch(onlinePeersUpdated(event.peers)),
      PEER_JOINED: (event) => dispatch(onlinePeerJoined(event.peerId, event.name)),
      PEER_LEFT: (event) => dispatch(onlinePeerLeft(event.peerId)),
      OFFER_RECEIVED: (event) => dispatch(serverOfferReceived(event.fromPeerId, event.name, event.sdp)),
      ANSWER_RECEIVED: (event) => dispatch(serverAnswerReceived(event.fromPeerId, event.sdp)),
      PREVIOUS_PEERS: (event) => dispatch(previousPeersReceived(event.peers)),
      ICE_RESTART_RECEIVED: (event) => dispatch(iceRestartReceived(event.fromPeerId, event.sdp)),
      ICE_RESTART_ANSWER_RECEIVED: (event) => dispatch(iceRestartAnswerReceived(event.fromPeerId, event.sdp)),
      EMAIL_SHARED: (event) => dispatch(emailSharedReceived(event.fromPeerId, event.email)),
      EMAIL_REVOKED: (event) => dispatch(emailRevokedReceived(event.fromPeerId)),
      BOARD_SAVED: () => {
        dispatch(boardSaved());
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_SAVED'}});
      },
      BOARD_LOADED: (event) => {
        dispatch(boardLoaded(event.board));
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_LOADED', board: event.board}});
      },
      BOARD_NOT_FOUND: () => {
        dispatch(boardNotFound());
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_NOT_FOUND'}});
      },
      GAME_STARTED: (event) => {
        dispatch(gameStarted(event.gameState));
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_STARTED', gameState: event.gameState}});
      },
      FIRE_RESULT: (event) => {
        dispatch(fireResult(event.playerShot, event.aiShot, event.phase));
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'FIRE_RESULT', playerShot: event.playerShot, aiShot: event.aiShot, phase: event.phase}});
      },
      GAME_STATE: (event) => {
        dispatch(gameStateReceived(event.gameState));
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_STATE', gameState: event.gameState}});
      },
      GAME_NOT_FOUND: () => {
        dispatch(gameNotFound());
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_NOT_FOUND'}});
      },
      P2P_GAME_LOADED: (event) => {
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'P2P_GAME_LOADED', gameState: event.gameState}});
        tryCatch(() => JSON.parse(event.gameState), () => null)
          .onSuccess(gs => {
            const decoded = p2pGameStateDecoder.decode(gs);
            if (decoded) {
              const localOpponentId = selectSignalingToPeer(getState())[decoded.opponentId];
              const game: P2pGame = {
                opponentId: localOpponentId ?? decoded.opponentId,
                phase: decoded.phase,
                myBoardHash: decoded.myBoardHash,
                opponentBoardHash: decoded.opponentBoardHash ?? null,
                myShots: decoded.myShots,
                opponentShots: decoded.opponentShots,
                myBoardReady: decoded.myBoardReady,
                opponentBoardReady: decoded.opponentBoardReady,
                winner: null,
                opponentBoard: null,
                boardVerified: null,
                announcement: '',
              };
              dispatchToGame?.(gameP2pGameLoaded(game));
            }
          });
      },
    });

    const dispatchSignalingAction = createDispatch<ConnectionsAction>({
      START_SIGNALING: () => { handle = startSignaling(config, dispatchSignalingEvent); },
      STOP_SIGNALING: () => {
        handle?.stop();
        handle = null;
      },
      RELAY_OFFER: (action) => handle?.send({type: 'RELAY_OFFER', targetPeerId: action.targetPeerId, sdp: action.sdp}),
      RELAY_ANSWER: (action) => handle?.send({type: 'RELAY_ANSWER', targetPeerId: action.targetPeerId, sdp: action.sdp}),
      FORGET_PEER: (action) => handle?.send({type: 'FORGET_PEER', targetPeerId: action.peerId}),
      RELAY_ICE_RESTART: (action) => handle?.send({type: 'RELAY_ICE_RESTART', targetPeerId: action.targetPeerId, sdp: action.sdp}),
      RELAY_ICE_RESTART_ANSWER: (action) => handle?.send({type: 'RELAY_ICE_RESTART_ANSWER', targetPeerId: action.targetPeerId, sdp: action.sdp}),
      SHARE_EMAIL: (action) => handle?.send({type: 'SHARE_EMAIL', targetPeerId: action.targetPeerId}),
      STOP_SHARING_EMAIL: (action) => handle?.send({type: 'STOP_SHARING_EMAIL', targetPeerId: action.targetPeerId}),
      UPDATE_EMAIL: (action) => handle?.send({type: 'UPDATE_EMAIL', email: action.email}),
      SAVE_PEER_EMAIL: (action) => handle?.send({type: 'SAVE_PEER_EMAIL', targetPeerId: action.peerId, email: action.email}),
      SAVE_BOARD: (action) => handle?.send({type: 'SAVE_BOARD', board: JSON.stringify(action.board)}),
      LOAD_BOARD: () => handle?.send({type: 'LOAD_BOARD'}),
      START_GAME: () => handle?.send({type: 'START_GAME'}),
      FIRE_SHOT: (action) => handle?.send({type: 'FIRE', row: action.row, col: action.col}),
      LOAD_GAME: () => handle?.send({type: 'LOAD_GAME'}),
      SAVE_P2P_GAME: (action) => {
        const game = action.gameState;
        const signalingOpponentId = selectPeerToSignaling(getState())[game.opponentId] ?? game.opponentId;
        handle?.send({type: 'SAVE_P2P_GAME', opponentId: signalingOpponentId, gameState: JSON.stringify({...game, opponentId: signalingOpponentId})});
      },
      LOAD_P2P_GAME: (action) => handle?.send({type: 'LOAD_P2P_GAME', opponentId: action.opponentId}),
    });

    return (action) => dispatchSignalingAction(action);
  };
