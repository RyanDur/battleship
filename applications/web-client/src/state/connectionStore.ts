import {connectionsReducer, initialState} from './connections';
import type {ConnectionsState, ConnectionsAction} from './connections';
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
  addListener: (fn: ListenerFn) => () => void
}

export type MiddlewareFactory = (deps: MiddlewareDeps) => (next: Dispatch) => Dispatch

export const applyMiddleware = (factories: MiddlewareFactory[]): MiddlewareFactory =>
  (deps) => (next) =>
    factories.reduceRight((acc, factory) => factory(deps)(acc), next);

export const createConnectionStore = (middlewareFactory?: MiddlewareFactory): ConnectionStore => {
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

  const middlewareAPI: MiddlewareDeps = {dispatch: (action) => store.dispatch(action), getState: () => state, addListener: (fn) => store.addListener(fn)};
  store.dispatch = middlewareFactory ? middlewareFactory(middlewareAPI)(baseDispatch) : baseDispatch;

  return store;
};

type HandlerMiddlewareConfig = {
  name: string
  createPeerConnection: () => RTCPeerConnection
}

export const createHandlerMiddleware = ({name, createPeerConnection}: HandlerMiddlewareConfig): MiddlewareFactory =>
  ({dispatch, getState, addListener}) => (next) => {
    const signalingPeerIds = new Map<string, string>();

    const emit = (event: PeerEvent) => {
      if (event.type === 'PEER_CONNECTED') {
        dispatch({type: 'PEER_CONNECTED', peerId: event.peerId});
        const signalingPeerId = signalingPeerIds.get(event.peerId);
        if (signalingPeerId) {
          dispatch({type: 'PREVIOUS_PEER_CONNECTED', signalingPeerId});
          signalingPeerIds.delete(event.peerId);
        }
      }
      else if (event.type === 'PEER_NAMED') dispatch({type: 'PEER_NAMED', peerId: event.peerId, name: event.name});
      else if (event.type === 'PEER_DISCONNECTED') dispatch({type: 'PEER_DISCONNECTED', peerId: event.peerId});
      else if (event.type === 'PEER_TRUST_UPDATED') dispatch({type: 'PEER_TRUST_UPDATED', peerId: event.peerId, trusts: event.trusts});
      else if (event.type === 'OFFER_CREATED') dispatch({type: 'OFFER_SDP_READY', peerId: event.peerId, sdp: event.sdp});
      else if (event.type === 'ANSWER_CREATED') dispatch({type: 'ANSWER_SDP_READY', sdp: event.sdp});
      else if (event.type === 'INTRODUCTION_RECEIVED') dispatch({type: 'INTRODUCTION_RECEIVED', introId: event.introId, from: event.from, peer: event.peer});
      else if (event.type === 'INTRODUCTION_DECLINED') dispatch({type: 'INTRODUCTION_RESOLVED', introId: event.introId});
      else if (event.type === 'INTRODUCTION_EXPIRED') dispatch({type: 'INTRODUCTION_RESOLVED', introId: event.introId});
      else if (event.type === 'SERVER_OFFER_CREATED') {
        signalingPeerIds.set(event.localPeerId, event.signalingPeerId);
        dispatch({type: 'RELAY_OFFER', targetPeerId: event.signalingPeerId, sdp: event.sdp});
      }
      else if (event.type === 'SERVER_ANSWER_CREATED') dispatch({type: 'RELAY_ANSWER', targetPeerId: event.signalingPeerId, sdp: event.sdp});
      else if (event.type === 'PEER_CONNECTION_UNSTABLE') dispatch({type: 'PEER_CONNECTION_UNSTABLE', peerId: event.peerId});
      else if (event.type === 'PEER_CONNECTION_RESTORED') dispatch({type: 'PEER_CONNECTION_RESTORED', peerId: event.peerId});
      else if (event.type === 'ICE_RESTART_OFFER_CREATED') dispatch({type: 'RELAY_ICE_RESTART', targetPeerId: event.signalingPeerId, sdp: event.sdp});
      else if (event.type === 'ICE_RESTART_ANSWER_CREATED') dispatch({type: 'RELAY_ICE_RESTART_ANSWER', targetPeerId: event.signalingPeerId, sdp: event.sdp});
    };

    const handler = createPeerHandler({name, createPeerConnection, emit, dispatch, getState});

    addListener((action) => {
      if (action.type === 'CREATE_OFFER') handler.handleCommand({type: 'CREATE_OFFER'});
      else if (action.type === 'ACCEPT_OFFER') handler.handleCommand({type: 'ACCEPT_OFFER', sdp: action.sdp});
      else if (action.type === 'ACCEPT_ANSWER') handler.handleCommand({type: 'ACCEPT_ANSWER', peerId: action.peerId, sdp: action.sdp});
      else if (action.type === 'DISCONNECT') handler.handleCommand({type: 'DISCONNECT', peerId: action.peerId});
      else if (action.type === 'GRANT_TRUST') handler.handleCommand({type: 'GRANT_TRUST', peerId: action.peerId});
      else if (action.type === 'REVOKE_TRUST') handler.handleCommand({type: 'REVOKE_TRUST', peerId: action.peerId});
      else if (action.type === 'INTRODUCE_PEERS') handler.handleCommand({type: 'INTRODUCE_PEERS', peerId1: action.peerId1, peerId2: action.peerId2});
      else if (action.type === 'ACCEPT_INTRODUCTION') handler.handleCommand({type: 'ACCEPT_INTRODUCTION', introId: action.introId});
      else if (action.type === 'DECLINE_INTRODUCTION') handler.handleCommand({type: 'DECLINE_INTRODUCTION', introId: action.introId});
      else if (action.type === 'CONNECT_VIA_SERVER') handler.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: action.signalingPeerId, name: action.name});
      else if (action.type === 'RECONNECT_VIA_SERVER') handler.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: action.signalingPeerId, name: action.name});
      else if (action.type === 'SERVER_OFFER_RECEIVED') handler.handleCommand({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: action.signalingPeerId, name: action.name, sdp: action.sdp});
      else if (action.type === 'SERVER_ANSWER_RECEIVED') handler.handleCommand({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp});
      else if (action.type === 'ICE_RESTART_RECEIVED') handler.handleCommand({type: 'ICE_RESTART_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp});
      else if (action.type === 'ICE_RESTART_ANSWER_RECEIVED') handler.handleCommand({type: 'ICE_RESTART_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp});
      else if (action.type === 'PEER_DISCONNECTED') handler.cleanup(action.peerId);
    });

    return (action: ConnectionsAction) => next(action);
  };

export const encodingMiddleware: MiddlewareFactory =
  ({dispatch, getState}) => (next) =>
    (action: ConnectionsAction) => {
      const {flow} = getState();
      if (action.type === 'OFFER_SDP_READY' && flow.phase === 'creating') {
        encodeConnectionCode(action.sdp, flow.passphrase).onSuccess(code => dispatch({type: 'OFFER_ENCODED', peerId: action.peerId, code}));
      } else if (action.type === 'ANSWER_SDP_READY' && flow.phase === 'joining') {
        encodeConnectionCode(action.sdp, flow.passphrase).onSuccess(code => dispatch({type: 'ANSWER_ENCODED', code}));
      }
      next(action);
    };

export const codecMiddleware: MiddlewareFactory =
  ({dispatch, getState}) => (next) =>
    (action: ConnectionsAction) => {
      if (action.type === 'JOIN_OFFER') {
        decodeConnectionCode(action.code, action.passphrase)
          .onSuccess(sdp => dispatch({type: 'ACCEPT_OFFER', sdp}))
          .onFailure(() => dispatch({type: 'DECODE_FAILED'}));
      } else if (action.type === 'ACCEPT_ANSWER_CODE') {
        const {flow} = getState();
        if (flow.phase === 'offer-ready') {
          decodeConnectionCode(action.responseCode, flow.passphrase)
            .onSuccess(sdp => dispatch({type: 'ACCEPT_ANSWER', peerId: flow.peerId, sdp}));
        }
      }
      next(action);
    };

type SignalingMiddlewareConfig = {
  config: SignalingConfig
}

export const createSignalingMiddleware = ({config}: SignalingMiddlewareConfig): MiddlewareFactory =>
  ({dispatch}) => (next) => {
    let handle: SignalingHandle | null = null;

    return (action: ConnectionsAction) => {
      if (action.type === 'START_SIGNALING') {
        handle = startSignaling(config, (event: SignalingEvent) => {
          if (event.type === 'PEERS') dispatch({type: 'ONLINE_PEERS_UPDATED', peers: event.peers});
          else if (event.type === 'PEER_JOINED') dispatch({type: 'ONLINE_PEER_JOINED', peerId: event.peerId, name: event.name});
          else if (event.type === 'PEER_LEFT') dispatch({type: 'ONLINE_PEER_LEFT', peerId: event.peerId});
          else if (event.type === 'OFFER_RECEIVED') dispatch({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: event.fromPeerId, name: event.name, sdp: event.sdp});
          else if (event.type === 'ANSWER_RECEIVED') dispatch({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: event.fromPeerId, sdp: event.sdp});
          else if (event.type === 'PREVIOUS_PEERS') dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: event.peers});
          else if (event.type === 'ICE_RESTART_RECEIVED') dispatch({type: 'ICE_RESTART_RECEIVED', signalingPeerId: event.fromPeerId, sdp: event.sdp});
          else if (event.type === 'ICE_RESTART_ANSWER_RECEIVED') dispatch({type: 'ICE_RESTART_ANSWER_RECEIVED', signalingPeerId: event.fromPeerId, sdp: event.sdp});
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
      }
      next(action);
    };
  };
