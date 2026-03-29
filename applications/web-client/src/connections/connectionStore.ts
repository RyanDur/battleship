import * as Decoder from 'schemawax';
import {connectionsReducer, initialState} from './connections';
import type {ConnectionsState, ConnectionsAction} from './connections';
import type {P2pGame} from '../game/game';
import {tryCatch} from '../lib/result';
import {maybe} from '../lib/maybe';
import {selectFlow, selectIntroChannels, selectIsCreatingOffer, selectOffererPeerIds, selectPeerToSignaling, selectSignalingToPeer, selectP2pGame as selectP2pGameFromConnections} from './connectionSelectors';
import {selectP2pGame as selectGameStoreP2pGame} from '../game/gameSelectors';
import type {GameState, GameAction} from '../game/game';
import {acceptChallenge as gameAcceptChallenge, declineChallenge as gameDeclineChallenge, cancelChallenge as gameCancelChallenge, challengePeer as gameChallengePeer, turnOrderDecided as gameTurnOrderDecided, p2pBoardReady as gameP2pBoardReady, peerDisconnected as gamePeerDisconnected, saveBoard as gameSaveBoard, startGame as gameStartGame, clearP2pGame as gameClearP2pGame, forfeitGame as gameForfeitGame} from '../game/gameActions';
import {peerConnected, previousPeerConnected, peerNamed, peerDisconnected, peerTrustUpdated, offerSdpReady, answerSdpReady, introductionReceived, introductionResolved, relayOffer, relayAnswer, peerConnectionUnstable, peerConnectionRestored, relayIceRestart, relayIceRestartAnswer, offerFailed, offerEncoded, answerEncoded, acceptOffer, decodeFailed, acceptAnswer, onlinePeersUpdated, onlinePeerJoined, onlinePeerLeft, serverOfferReceived, serverAnswerReceived, previousPeersReceived, iceRestartReceived, iceRestartAnswerReceived, emailSharedReceived, emailRevokedReceived, messageReceived, boardSaved, boardLoaded, boardNotFound, gameStarted, fireResult, gameStateReceived, gameNotFound, loadBoard, loadGame, p2pGameLoaded, saveP2pGame, loadP2pGame, turnOrderDecided} from './connectionActions';
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

const makeHandlerEmit = (dispatch: Dispatch, getState: () => ConnectionsState, portEmit?: (event: ConnectionEvent) => void) =>
  (event: PeerEvent) => {
    const peerEventHandlers: Partial<Record<PeerEvent['type'], () => void>> = {
      PEER_CONNECTED: () => {
        if (event.type !== 'PEER_CONNECTED') return;
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
      PEER_NAMED: () => {
        if (event.type !== 'PEER_NAMED') return;
        dispatch(peerNamed(event.peerId, event.name));
        portEmit?.({type: 'PEER_NAMED', peerId: event.peerId, name: event.name});
      },
      PEER_DISCONNECTED: () => {
        if (event.type !== 'PEER_DISCONNECTED') return;
        dispatch(peerDisconnected(event.peerId));
      },
      PEER_TRUST_UPDATED: () => {
        if (event.type !== 'PEER_TRUST_UPDATED') return;
        dispatch(peerTrustUpdated(event.peerId, event.trusts));
      },
      OFFER_CREATED: () => {
        if (event.type !== 'OFFER_CREATED') return;
        dispatch(offerSdpReady(event.peerId, event.sdp));
      },
      ANSWER_CREATED: () => {
        if (event.type !== 'ANSWER_CREATED') return;
        dispatch(answerSdpReady(event.sdp));
      },
      INTRODUCTION_RECEIVED: () => {
        if (event.type !== 'INTRODUCTION_RECEIVED') return;
        dispatch(introductionReceived(event.introId, event.from, event.peer));
      },
      INTRODUCTION_DECLINED: () => {
        if (event.type !== 'INTRODUCTION_DECLINED') return;
        dispatch(introductionResolved(event.introId));
      },
      INTRODUCTION_EXPIRED: () => {
        if (event.type !== 'INTRODUCTION_EXPIRED') return;
        dispatch(introductionResolved(event.introId));
      },
      SERVER_OFFER_CREATED: () => {
        if (event.type !== 'SERVER_OFFER_CREATED') return;
        dispatch(relayOffer(event.signalingPeerId, event.sdp));
      },
      SERVER_ANSWER_CREATED: () => {
        if (event.type !== 'SERVER_ANSWER_CREATED') return;
        dispatch(relayAnswer(event.signalingPeerId, event.sdp));
      },
      PEER_CONNECTION_UNSTABLE: () => {
        if (event.type !== 'PEER_CONNECTION_UNSTABLE') return;
        dispatch(peerConnectionUnstable(event.peerId));
      },
      PEER_CONNECTION_RESTORED: () => {
        if (event.type !== 'PEER_CONNECTION_RESTORED') return;
        dispatch(peerConnectionRestored(event.peerId));
      },
      ICE_RESTART_OFFER_CREATED: () => {
        if (event.type !== 'ICE_RESTART_OFFER_CREATED') return;
        dispatch(relayIceRestart(event.signalingPeerId, event.sdp));
      },
      ICE_RESTART_ANSWER_CREATED: () => {
        if (event.type !== 'ICE_RESTART_ANSWER_CREATED') return;
        dispatch(relayIceRestartAnswer(event.signalingPeerId, event.sdp));
      },
      MESSAGE_RECEIVED: () => {
        if (event.type !== 'MESSAGE_RECEIVED') return;
        dispatch(messageReceived(event.peerId, event.text));
      },
      ERROR: () => {
        if (selectIsCreatingOffer(getState())) dispatch(offerFailed());
      },
    };
    maybe(peerEventHandlers[event.type]).map(fn => fn());
  };

export const createHandlerListener = ({name, createPeerConnection, portEmit, getGameState, dispatchToGame}: HandlerListenerConfig): ListenerFactory =>
  ({dispatch, getState}) => {
    const emit = makeHandlerEmit(dispatch, getState, portEmit);
    const handler = createPeerHandler({name, createPeerConnection, emit, emitToPort: portEmit ?? (() => {}), dispatch, getState});

    // Read game state from game store when available, fall back to connection store for backwards compatibility
    const getGame = () => getGameState ? selectGameStoreP2pGame(getGameState()) : null;

    return (action, {prevState, state}) => {
      // Bridge game state actions to game store
      const gameBridgeHandlers: Partial<Record<ConnectionsAction['type'], () => void>> = {
        SAVE_BOARD: () => { if (action.type === 'SAVE_BOARD' && dispatchToGame) dispatchToGame(gameSaveBoard(action.board)); },
        START_GAME: () => { if (dispatchToGame) dispatchToGame(gameStartGame()); },
        CLEAR_P2P_GAME: () => { if (dispatchToGame) dispatchToGame(gameClearP2pGame()); },
      };
      maybe(gameBridgeHandlers[action.type]).map(fn => fn());

      const handlerCommandHandlers: Partial<Record<ConnectionsAction['type'], () => void>> = {
        CREATE_OFFER: () => handler.handleCommand({type: 'CREATE_OFFER'}),
        ACCEPT_OFFER: () => { if (action.type === 'ACCEPT_OFFER') handler.handleCommand({type: 'ACCEPT_OFFER', sdp: action.sdp}); },
        ACCEPT_ANSWER: () => { if (action.type === 'ACCEPT_ANSWER') handler.handleCommand({type: 'ACCEPT_ANSWER', peerId: action.peerId, sdp: action.sdp}); },
        DISCONNECT: () => { if (action.type === 'DISCONNECT') handler.handleCommand({type: 'DISCONNECT', peerId: action.peerId}); },
        GRANT_TRUST: () => { if (action.type === 'GRANT_TRUST') handler.handleCommand({type: 'GRANT_TRUST', peerId: action.peerId}); },
        REVOKE_TRUST: () => { if (action.type === 'REVOKE_TRUST') handler.handleCommand({type: 'REVOKE_TRUST', peerId: action.peerId}); },
        INTRODUCE_PEERS: () => { if (action.type === 'INTRODUCE_PEERS') handler.handleCommand({type: 'INTRODUCE_PEERS', peerId1: action.peerId1, peerId2: action.peerId2}); },
        ACCEPT_INTRODUCTION: () => { if (action.type === 'ACCEPT_INTRODUCTION') handler.handleCommand({type: 'ACCEPT_INTRODUCTION', introId: action.introId, relayPeerId: selectIntroChannels(prevState)[action.introId]}); },
        DECLINE_INTRODUCTION: () => { if (action.type === 'DECLINE_INTRODUCTION') handler.handleCommand({type: 'DECLINE_INTRODUCTION', introId: action.introId, relayPeerId: selectIntroChannels(prevState)[action.introId]}); },
        CONNECT_VIA_SERVER: () => { if (action.type === 'CONNECT_VIA_SERVER') handler.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: action.signalingPeerId, name: action.name}); },
        RECONNECT_VIA_SERVER: () => { if (action.type === 'RECONNECT_VIA_SERVER') handler.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: action.signalingPeerId, name: action.name}); },
        SERVER_OFFER_RECEIVED: () => { if (action.type === 'SERVER_OFFER_RECEIVED') handler.handleCommand({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: action.signalingPeerId, name: action.name, sdp: action.sdp}); },
        SERVER_ANSWER_RECEIVED: () => { if (action.type === 'SERVER_ANSWER_RECEIVED') handler.handleCommand({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp}); },
        ICE_RESTART_RECEIVED: () => { if (action.type === 'ICE_RESTART_RECEIVED') handler.handleCommand({type: 'ICE_RESTART_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp}); },
        ICE_RESTART_ANSWER_RECEIVED: () => { if (action.type === 'ICE_RESTART_ANSWER_RECEIVED') handler.handleCommand({type: 'ICE_RESTART_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp}); },
        SEND_MESSAGE: () => { if (action.type === 'SEND_MESSAGE') handler.handleCommand({type: 'SEND_MESSAGE', peerId: action.peerId, text: action.text}); },
        SEND_TO_PEER: () => { if (action.type === 'SEND_TO_PEER') handler.handleCommand({type: 'SEND_TO_PEER', peerId: action.peerId, message: action.message}); },
        PEER_DISCONNECTED: () => {
          if (action.type !== 'PEER_DISCONNECTED') return;
          handler.cleanup(action.peerId);
          dispatchToGame?.(gamePeerDisconnected(action.peerId));
        },
      };

      if (maybe(handlerCommandHandlers[action.type]).map(fn => { fn(); return true; }).orElse(false)) return;

      const game = getGame();
      const opponentId = game?.opponentId ?? (action.type === 'CHALLENGE_PEER' ? action.opponentId : null);
      if (!opponentId) return;
      const send = (message: Record<string, unknown>) =>
        handler.handleCommand({type: 'SEND_TO_PEER', peerId: opponentId, message});

      const gameActionHandlers: Partial<Record<ConnectionsAction['type'], () => void>> = {
        CHALLENGE_PEER: () => {
          if (action.type !== 'CHALLENGE_PEER') return;
          send({type: 'GAME_CHALLENGE'});
          dispatchToGame?.(gameChallengePeer(opponentId));
          const signalingId = selectPeerToSignaling(state)[action.opponentId];
          if (signalingId) dispatch(loadP2pGame(signalingId));
        },
        ACCEPT_CHALLENGE: () => {
          // Only the challengee (phase was 'challenge-received') sends GAME_ACCEPT.
          // The challenger receiving GAME_ACCEPT also dispatches acceptChallenge — skip to avoid echo loop.
          if (getGame()?.phase === 'challenge-received') {
            send({type: 'GAME_ACCEPT'});
            dispatchToGame?.(gameAcceptChallenge());
            const signalingId = selectPeerToSignaling(state)[opponentId];
            if (signalingId) dispatch(loadP2pGame(signalingId));
          }
        },
        DECLINE_CHALLENGE: () => {
          send({type: 'GAME_DECLINE'});
          dispatchToGame?.(gameDeclineChallenge());
        },
        CANCEL_CHALLENGE: () => {
          send({type: 'GAME_CANCEL'});
          dispatchToGame?.(gameCancelChallenge());
        },
        P2P_BOARD_READY: () => {
          if (action.type !== 'P2P_BOARD_READY') return;
          send({type: 'BOARD_READY', boardHash: action.boardHash});
          dispatchToGame?.(gameP2pBoardReady(action.boardHash));
        },
        TAKE_FIRST_TURN: () => {
          send({type: 'GAME_FIRST_TURN'});
          dispatch(turnOrderDecided(true));
        },
        CLAIM_FIRST_TURN: () => handler.handleCommand({type: 'START_COIN_FLIP', peerId: opponentId}),
        COIN_FLIP_COMMIT: () => { if (action.type === 'COIN_FLIP_COMMIT') send({type: 'COIN_FLIP_COMMIT', hash: action.hash}); },
        COIN_FLIP_REVEAL: () => { if (action.type === 'COIN_FLIP_REVEAL') send({type: 'COIN_FLIP_REVEAL', value: action.value}); },
        P2P_FIRE: () => {
          if (action.type !== 'P2P_FIRE') return;
          const prevGame = getGameState ? selectGameStoreP2pGame(getGameState()) : null;
          if (prevGame?.phase !== 'my-turn') return;
          if (!prevGame.myShots.some(s => s.cell.row === action.row && s.cell.col === action.col)) {
            send({type: 'FIRE', row: action.row, col: action.col});
          }
        },
        FORFEIT_GAME: () => {
          send({type: 'GAME_FORFEIT'});
          dispatchToGame?.(gameForfeitGame());
        },
        TURN_ORDER_DECIDED: () => {
          if (action.type !== 'TURN_ORDER_DECIDED') return;
          dispatchToGame?.(gameTurnOrderDecided(action.iGoFirst));
          if (getGame()) dispatch(saveP2pGame());
        },
        P2P_FIRE_RESULT: () => { if (getGame()) dispatch(saveP2pGame()); },
        OPPONENT_FIRED: () => { if (getGame()) dispatch(saveP2pGame()); },
        P2P_GAME_OVER: () => { if (getGame()) dispatch(saveP2pGame()); },
        P2P_GAME_LOADED: () => {
          const prevGame = selectP2pGameFromConnections(prevState);
          const loadedGame = selectP2pGameFromConnections(state);
          // Send sync only on reconnect: game restored from null (refreshed) or disconnected
          if (loadedGame && (loadedGame.phase === 'my-turn' || loadedGame.phase === 'their-turn')) {
            if (!prevGame || prevGame.phase === 'disconnected') {
              send({type: 'GAME_STATE_SYNC', myShots: loadedGame.myShots, opponentShots: loadedGame.opponentShots, phase: loadedGame.phase});
            }
          }
        },
      };
      maybe(gameActionHandlers[action.type]).map(fn => fn());
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
}

export const createSignalingListener = ({config, portEmit}: SignalingListenerConfig): ListenerFactory =>
  ({dispatch, getState}) => {
    let handle: SignalingHandle | null = null;

    return (action) => {
      const signalingActionHandlers: Partial<Record<ConnectionsAction['type'], () => void>> = {
        START_SIGNALING: () => {
          handle = startSignaling(config, (event: SignalingEvent) => {
            const signalingEventHandlers: Partial<Record<SignalingEvent['type'], () => void>> = {
              REGISTERED: () => {
                dispatch(loadBoard());
                dispatch(loadGame());
                portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'REGISTERED'}});
              },
              PEERS: () => {
                if (event.type !== 'PEERS') return;
                dispatch(onlinePeersUpdated(event.peers));
              },
              PEER_JOINED: () => {
                if (event.type !== 'PEER_JOINED') return;
                dispatch(onlinePeerJoined(event.peerId, event.name));
              },
              PEER_LEFT: () => {
                if (event.type !== 'PEER_LEFT') return;
                dispatch(onlinePeerLeft(event.peerId));
              },
              OFFER_RECEIVED: () => {
                if (event.type !== 'OFFER_RECEIVED') return;
                dispatch(serverOfferReceived(event.fromPeerId, event.name, event.sdp));
              },
              ANSWER_RECEIVED: () => {
                if (event.type !== 'ANSWER_RECEIVED') return;
                dispatch(serverAnswerReceived(event.fromPeerId, event.sdp));
              },
              PREVIOUS_PEERS: () => {
                if (event.type !== 'PREVIOUS_PEERS') return;
                dispatch(previousPeersReceived(event.peers));
              },
              ICE_RESTART_RECEIVED: () => {
                if (event.type !== 'ICE_RESTART_RECEIVED') return;
                dispatch(iceRestartReceived(event.fromPeerId, event.sdp));
              },
              ICE_RESTART_ANSWER_RECEIVED: () => {
                if (event.type !== 'ICE_RESTART_ANSWER_RECEIVED') return;
                dispatch(iceRestartAnswerReceived(event.fromPeerId, event.sdp));
              },
              EMAIL_SHARED: () => {
                if (event.type !== 'EMAIL_SHARED') return;
                dispatch(emailSharedReceived(event.fromPeerId, event.email));
              },
              EMAIL_REVOKED: () => {
                if (event.type !== 'EMAIL_REVOKED') return;
                dispatch(emailRevokedReceived(event.fromPeerId));
              },
              BOARD_SAVED: () => {
                dispatch(boardSaved());
                portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_SAVED'}});
              },
              BOARD_LOADED: () => {
                if (event.type !== 'BOARD_LOADED') return;
                dispatch(boardLoaded(event.board));
                portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_LOADED', board: event.board}});
              },
              BOARD_NOT_FOUND: () => {
                dispatch(boardNotFound());
                portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_NOT_FOUND'}});
              },
              GAME_STARTED: () => {
                if (event.type !== 'GAME_STARTED') return;
                dispatch(gameStarted(event.gameState));
                portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_STARTED', gameState: event.gameState}});
              },
              FIRE_RESULT: () => {
                if (event.type !== 'FIRE_RESULT') return;
                dispatch(fireResult(event.playerShot, event.aiShot, event.phase));
                portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'FIRE_RESULT', playerShot: event.playerShot, aiShot: event.aiShot, phase: event.phase}});
              },
              GAME_STATE: () => {
                if (event.type !== 'GAME_STATE') return;
                dispatch(gameStateReceived(event.gameState));
                portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_STATE', gameState: event.gameState}});
              },
              GAME_NOT_FOUND: () => {
                dispatch(gameNotFound());
                portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_NOT_FOUND'}});
              },
              P2P_GAME_LOADED: () => {
                if (event.type !== 'P2P_GAME_LOADED') return;
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
                      dispatch(p2pGameLoaded(game));
                    }
                  });
              },
            };
            maybe(signalingEventHandlers[event.type]).map(fn => fn());
          });
        },
        STOP_SIGNALING: () => {
          handle?.stop();
          handle = null;
        },
        RELAY_OFFER: () => { if (action.type === 'RELAY_OFFER') handle?.send({type: 'RELAY_OFFER', targetPeerId: action.targetPeerId, sdp: action.sdp}); },
        RELAY_ANSWER: () => { if (action.type === 'RELAY_ANSWER') handle?.send({type: 'RELAY_ANSWER', targetPeerId: action.targetPeerId, sdp: action.sdp}); },
        FORGET_PEER: () => { if (action.type === 'FORGET_PEER') handle?.send({type: 'FORGET_PEER', targetPeerId: action.peerId}); },
        RELAY_ICE_RESTART: () => { if (action.type === 'RELAY_ICE_RESTART') handle?.send({type: 'RELAY_ICE_RESTART', targetPeerId: action.targetPeerId, sdp: action.sdp}); },
        RELAY_ICE_RESTART_ANSWER: () => { if (action.type === 'RELAY_ICE_RESTART_ANSWER') handle?.send({type: 'RELAY_ICE_RESTART_ANSWER', targetPeerId: action.targetPeerId, sdp: action.sdp}); },
        SHARE_EMAIL: () => { if (action.type === 'SHARE_EMAIL') handle?.send({type: 'SHARE_EMAIL', targetPeerId: action.targetPeerId}); },
        STOP_SHARING_EMAIL: () => { if (action.type === 'STOP_SHARING_EMAIL') handle?.send({type: 'STOP_SHARING_EMAIL', targetPeerId: action.targetPeerId}); },
        UPDATE_EMAIL: () => { if (action.type === 'UPDATE_EMAIL') handle?.send({type: 'UPDATE_EMAIL', email: action.email}); },
        SAVE_PEER_EMAIL: () => { if (action.type === 'SAVE_PEER_EMAIL') handle?.send({type: 'SAVE_PEER_EMAIL', targetPeerId: action.peerId, email: action.email}); },
        SAVE_BOARD: () => { if (action.type === 'SAVE_BOARD') handle?.send({type: 'SAVE_BOARD', board: JSON.stringify(action.board)}); },
        LOAD_BOARD: () => handle?.send({type: 'LOAD_BOARD'}),
        START_GAME: () => handle?.send({type: 'START_GAME'}),
        FIRE_SHOT: () => { if (action.type === 'FIRE_SHOT') handle?.send({type: 'FIRE', row: action.row, col: action.col}); },
        LOAD_GAME: () => handle?.send({type: 'LOAD_GAME'}),
        SAVE_P2P_GAME: () => {
          if (action.type !== 'SAVE_P2P_GAME') return;
          const game = action.gameState ?? selectP2pGameFromConnections(getState());
          if (game) {
            const signalingOpponentId = selectPeerToSignaling(getState())[game.opponentId] ?? game.opponentId;
            handle?.send({type: 'SAVE_P2P_GAME', opponentId: signalingOpponentId, gameState: JSON.stringify({...game, opponentId: signalingOpponentId})});
          }
        },
        LOAD_P2P_GAME: () => { if (action.type === 'LOAD_P2P_GAME') handle?.send({type: 'LOAD_P2P_GAME', opponentId: action.opponentId}); },
      };
      maybe(signalingActionHandlers[action.type]).map(fn => fn());
    };
  };
