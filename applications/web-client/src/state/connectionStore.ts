import {connectionsReducer, initialState} from './connections';
import type {ConnectionsState, ConnectionsAction} from './connections';
import {tryCatch} from '../lib/result';
import {selectFlow, selectIntroChannels, selectIsCreatingOffer, selectOffererPeerIds, selectPeerToSignaling} from './connectionSelectors';
import {peerConnected, previousPeerConnected, peerNamed, peerDisconnected, peerTrustUpdated, offerSdpReady, answerSdpReady, introductionReceived, introductionResolved, relayOffer, relayAnswer, peerConnectionUnstable, peerConnectionRestored, relayIceRestart, relayIceRestartAnswer, offerFailed, offerEncoded, answerEncoded, acceptOffer, decodeFailed, acceptAnswer, onlinePeersUpdated, onlinePeerJoined, onlinePeerLeft, serverOfferReceived, serverAnswerReceived, previousPeersReceived, iceRestartReceived, iceRestartAnswerReceived, emailSharedReceived, emailRevokedReceived, messageReceived, boardSaved, boardLoaded, boardNotFound, gameStarted, fireResult, gameStateReceived, gameNotFound, loadBoard, loadGame, turnOrderDecided, p2pGameLoaded} from './connectionActions';
import {selectP2pGame} from './connectionSelectors';
import type {PeerEvent} from '../types/worker-messages';
import {encodeConnectionCode, decodeConnectionCode} from '../protocol/connection-code';
import {createPeerHandler} from '../workers/connection.handler';
import {startSignaling} from '../protocol/signaling';
import type {SignalingConfig, SignalingEvent, SignalingHandle} from '../protocol/signaling';

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
}

const makeHandlerEmit = (dispatch: Dispatch, getState: () => ConnectionsState) =>
  (event: PeerEvent) => {
    if (event.type === 'PEER_CONNECTED') {
      dispatch(peerConnected(event.peerId));
      if (selectOffererPeerIds(getState()).includes(event.peerId)) {
        const signalingPeerId = selectPeerToSignaling(getState())[event.peerId];
        if (signalingPeerId) dispatch(previousPeerConnected(signalingPeerId));
      }
    }
    else if (event.type === 'PEER_NAMED') dispatch(peerNamed(event.peerId, event.name));
    else if (event.type === 'PEER_DISCONNECTED') dispatch(peerDisconnected(event.peerId));
    else if (event.type === 'PEER_TRUST_UPDATED') dispatch(peerTrustUpdated(event.peerId, event.trusts));
    else if (event.type === 'OFFER_CREATED') dispatch(offerSdpReady(event.peerId, event.sdp));
    else if (event.type === 'ANSWER_CREATED') dispatch(answerSdpReady(event.sdp));
    else if (event.type === 'INTRODUCTION_RECEIVED') dispatch(introductionReceived(event.introId, event.from, event.peer));
    else if (event.type === 'INTRODUCTION_DECLINED') dispatch(introductionResolved(event.introId));
    else if (event.type === 'INTRODUCTION_EXPIRED') dispatch(introductionResolved(event.introId));
    else if (event.type === 'SERVER_OFFER_CREATED') dispatch(relayOffer(event.signalingPeerId, event.sdp));
    else if (event.type === 'SERVER_ANSWER_CREATED') dispatch(relayAnswer(event.signalingPeerId, event.sdp));
    else if (event.type === 'PEER_CONNECTION_UNSTABLE') dispatch(peerConnectionUnstable(event.peerId));
    else if (event.type === 'PEER_CONNECTION_RESTORED') dispatch(peerConnectionRestored(event.peerId));
    else if (event.type === 'ICE_RESTART_OFFER_CREATED') dispatch(relayIceRestart(event.signalingPeerId, event.sdp));
    else if (event.type === 'ICE_RESTART_ANSWER_CREATED') dispatch(relayIceRestartAnswer(event.signalingPeerId, event.sdp));
    else if (event.type === 'MESSAGE_RECEIVED') dispatch(messageReceived(event.peerId, event.text));
    else if (event.type === 'ERROR') {
      if (selectIsCreatingOffer(getState())) dispatch(offerFailed());
    }
  };

export const createHandlerListener = ({name, createPeerConnection}: HandlerListenerConfig): ListenerFactory =>
  ({dispatch, getState}) => {
    const emit = makeHandlerEmit(dispatch, getState);
    const handler = createPeerHandler({name, createPeerConnection, emit, dispatch, getState});

    return (action, {prevState, state}) => {
      if (action.type === 'CREATE_OFFER') handler.handleCommand({type: 'CREATE_OFFER'});
      else if (action.type === 'ACCEPT_OFFER') handler.handleCommand({type: 'ACCEPT_OFFER', sdp: action.sdp});
      else if (action.type === 'ACCEPT_ANSWER') handler.handleCommand({type: 'ACCEPT_ANSWER', peerId: action.peerId, sdp: action.sdp});
      else if (action.type === 'DISCONNECT') handler.handleCommand({type: 'DISCONNECT', peerId: action.peerId});
      else if (action.type === 'GRANT_TRUST') handler.handleCommand({type: 'GRANT_TRUST', peerId: action.peerId});
      else if (action.type === 'REVOKE_TRUST') handler.handleCommand({type: 'REVOKE_TRUST', peerId: action.peerId});
      else if (action.type === 'INTRODUCE_PEERS') handler.handleCommand({type: 'INTRODUCE_PEERS', peerId1: action.peerId1, peerId2: action.peerId2});
      else if (action.type === 'ACCEPT_INTRODUCTION') handler.handleCommand({type: 'ACCEPT_INTRODUCTION', introId: action.introId, relayPeerId: selectIntroChannels(prevState)[action.introId]});
      else if (action.type === 'DECLINE_INTRODUCTION') handler.handleCommand({type: 'DECLINE_INTRODUCTION', introId: action.introId, relayPeerId: selectIntroChannels(prevState)[action.introId]});
      else if (action.type === 'CONNECT_VIA_SERVER') handler.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: action.signalingPeerId, name: action.name});
      else if (action.type === 'RECONNECT_VIA_SERVER') handler.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: action.signalingPeerId, name: action.name});
      else if (action.type === 'SERVER_OFFER_RECEIVED') handler.handleCommand({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: action.signalingPeerId, name: action.name, sdp: action.sdp});
      else if (action.type === 'SERVER_ANSWER_RECEIVED') handler.handleCommand({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp});
      else if (action.type === 'ICE_RESTART_RECEIVED') handler.handleCommand({type: 'ICE_RESTART_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp});
      else if (action.type === 'ICE_RESTART_ANSWER_RECEIVED') handler.handleCommand({type: 'ICE_RESTART_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp});
      else if (action.type === 'SEND_MESSAGE') handler.handleCommand({type: 'SEND_MESSAGE', peerId: action.peerId, text: action.text});
      else if (action.type === 'PEER_DISCONNECTED') handler.cleanup(action.peerId);
      else {
        const game = selectP2pGame(state);
        const opponentId = game?.opponentId ?? (action.type === 'CHALLENGE_PEER' ? action.opponentId : null);
        if (!opponentId) return;
        const send = (message: Record<string, unknown>) =>
          handler.handleCommand({type: 'SEND_TO_PEER', peerId: opponentId, message});
        if (action.type === 'CHALLENGE_PEER') send({type: 'GAME_CHALLENGE'});
        else if (action.type === 'ACCEPT_CHALLENGE') send({type: 'GAME_ACCEPT'});
        else if (action.type === 'DECLINE_CHALLENGE') send({type: 'GAME_DECLINE'});
        else if (action.type === 'CANCEL_CHALLENGE') send({type: 'GAME_CANCEL'});
        else if (action.type === 'P2P_BOARD_READY') send({type: 'BOARD_READY', boardHash: action.boardHash});
        else if (action.type === 'CLAIM_FIRST_TURN') {
          send({type: 'CLAIM_FIRST'});
          dispatch(turnOrderDecided(true));
        }
        else if (action.type === 'COIN_FLIP_COMMIT') send({type: 'COIN_FLIP_COMMIT', hash: action.hash});
        else if (action.type === 'COIN_FLIP_REVEAL') send({type: 'COIN_FLIP_REVEAL', value: action.value});
        else if (action.type === 'P2P_FIRE') send({type: 'FIRE', row: action.row, col: action.col});
        else if (action.type === 'FORFEIT_GAME') send({type: 'GAME_FORFEIT'});
        else if (action.type === 'P2P_STATE_SYNC') {
          send({type: 'GAME_STATE_SYNC', myShots: action.myShots, opponentShots: action.opponentShots, phase: action.phase});
        }
      }
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

type SignalingListenerConfig = {
  config: SignalingConfig
}

export const createSignalingListener = ({config}: SignalingListenerConfig): ListenerFactory =>
  ({dispatch, getState}) => {
    let handle: SignalingHandle | null = null;

    return (action) => {
      if (action.type === 'START_SIGNALING') {
        handle = startSignaling(config, (event: SignalingEvent) => {
          if (event.type === 'REGISTERED') { dispatch(loadBoard()); dispatch(loadGame()); }
          else if (event.type === 'PEERS') dispatch(onlinePeersUpdated(event.peers));
          else if (event.type === 'PEER_JOINED') dispatch(onlinePeerJoined(event.peerId, event.name));
          else if (event.type === 'PEER_LEFT') dispatch(onlinePeerLeft(event.peerId));
          else if (event.type === 'OFFER_RECEIVED') dispatch(serverOfferReceived(event.fromPeerId, event.name, event.sdp));
          else if (event.type === 'ANSWER_RECEIVED') dispatch(serverAnswerReceived(event.fromPeerId, event.sdp));
          else if (event.type === 'PREVIOUS_PEERS') dispatch(previousPeersReceived(event.peers));
          else if (event.type === 'ICE_RESTART_RECEIVED') dispatch(iceRestartReceived(event.fromPeerId, event.sdp));
          else if (event.type === 'ICE_RESTART_ANSWER_RECEIVED') dispatch(iceRestartAnswerReceived(event.fromPeerId, event.sdp));
          else if (event.type === 'EMAIL_SHARED') dispatch(emailSharedReceived(event.fromPeerId, event.email));
          else if (event.type === 'EMAIL_REVOKED') dispatch(emailRevokedReceived(event.fromPeerId));
          else if (event.type === 'BOARD_SAVED') dispatch(boardSaved());
          else if (event.type === 'BOARD_LOADED') dispatch(boardLoaded(event.board));
          else if (event.type === 'BOARD_NOT_FOUND') dispatch(boardNotFound());
          else if (event.type === 'GAME_STARTED') dispatch(gameStarted(event.gameState));
          else if (event.type === 'FIRE_RESULT') dispatch(fireResult(event.playerShot, event.aiShot, event.phase));
          else if (event.type === 'GAME_STATE') dispatch(gameStateReceived(event.gameState));
          else if (event.type === 'GAME_NOT_FOUND') dispatch(gameNotFound());
          else if (event.type === 'P2P_GAME_LOADED') {
            tryCatch(() => JSON.parse(event.gameState), () => null)
              .onSuccess(gs => { if (gs) dispatch(p2pGameLoaded(gs)); });
          }
        });
      } else if (action.type === 'STOP_SIGNALING') {
        handle?.stop();
        handle = null;
      } else if (action.type === 'RELAY_OFFER') {
        handle?.send({type: 'RELAY_OFFER', targetPeerId: action.targetPeerId, sdp: action.sdp});
      } else if (action.type === 'RELAY_ANSWER') {
        handle?.send({type: 'RELAY_ANSWER', targetPeerId: action.targetPeerId, sdp: action.sdp});
      } else if (action.type === 'FORGET_PEER') {
        handle?.send({type: 'FORGET_PEER', targetPeerId: action.peerId});
      } else if (action.type === 'RELAY_ICE_RESTART') {
        handle?.send({type: 'RELAY_ICE_RESTART', targetPeerId: action.targetPeerId, sdp: action.sdp});
      } else if (action.type === 'RELAY_ICE_RESTART_ANSWER') {
        handle?.send({type: 'RELAY_ICE_RESTART_ANSWER', targetPeerId: action.targetPeerId, sdp: action.sdp});
      } else if (action.type === 'SHARE_EMAIL') {
        handle?.send({type: 'SHARE_EMAIL', targetPeerId: action.targetPeerId});
      } else if (action.type === 'STOP_SHARING_EMAIL') {
        handle?.send({type: 'STOP_SHARING_EMAIL', targetPeerId: action.targetPeerId});
      } else if (action.type === 'UPDATE_EMAIL') {
        handle?.send({type: 'UPDATE_EMAIL', email: action.email});
      } else if (action.type === 'SAVE_PEER_EMAIL') {
        handle?.send({type: 'SAVE_PEER_EMAIL', targetPeerId: action.peerId, email: action.email});
      } else if (action.type === 'SAVE_BOARD') {
        handle?.send({type: 'SAVE_BOARD', board: JSON.stringify(action.board)});
      } else if (action.type === 'LOAD_BOARD') {
        handle?.send({type: 'LOAD_BOARD'});
      } else if (action.type === 'START_GAME') {
        handle?.send({type: 'START_GAME'});
      } else if (action.type === 'FIRE_SHOT') {
        handle?.send({type: 'FIRE', row: action.row, col: action.col});
      } else if (action.type === 'LOAD_GAME') {
        handle?.send({type: 'LOAD_GAME'});
      } else if (action.type === 'SAVE_P2P_GAME') {
        const game = selectP2pGame(getState());
        if (game) handle?.send({type: 'SAVE_P2P_GAME', opponentId: game.opponentId, gameState: JSON.stringify(game)});
      } else if (action.type === 'LOAD_P2P_GAME') {
        handle?.send({type: 'LOAD_P2P_GAME', opponentId: action.opponentId});
      }
    };
  };
