import {connectionsReducer, initialState} from './connections';
import type {ConnectionsState, ConnectionsAction} from './connections';
import type {PeerCommand, PeerEvent} from '../types/worker-messages';
import type {CodecError} from '../protocol/connection-code';
import type {Result} from '../lib/result';

type Handler = {handleCommand: (cmd: PeerCommand) => void}

export type ConnectionStore = {
  getState: () => ConnectionsState
  subscribe: (fn: () => void) => () => void
  dispatch: (action: ConnectionsAction) => void
  applyMiddleware: (fn: (action: ConnectionsAction) => void) => () => void
}

export const createConnectionStore = (): ConnectionStore => {
  let state = initialState;
  const listeners = new Set<() => void>();
  const middlewares = new Set<(action: ConnectionsAction) => void>();

  const dispatch = (action: ConnectionsAction) => {
    state = connectionsReducer(state, action);
    listeners.forEach(fn => fn());
    middlewares.forEach(fn => fn(action));
  };

  return {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch,
    applyMiddleware: (fn) => { middlewares.add(fn); return () => middlewares.delete(fn); },
  };
};

type HandlerMiddlewareDeps = {
  createHandler: (emit: (event: PeerEvent) => void) => Handler
  dispatch: (action: ConnectionsAction) => void
}

export const createHandlerMiddleware = ({createHandler, dispatch}: HandlerMiddlewareDeps) => {
  const emit = (event: PeerEvent) => {
    if (event.type === 'PEER_CONNECTED') dispatch({type: 'PEER_CONNECTED', peerId: event.peerId});
    else if (event.type === 'PEER_NAMED') dispatch({type: 'PEER_NAMED', peerId: event.peerId, name: event.name});
    else if (event.type === 'PEER_DISCONNECTED') dispatch({type: 'PEER_DISCONNECTED', peerId: event.peerId});
    else if (event.type === 'PEER_TRUST_UPDATED') dispatch({type: 'PEER_TRUST_UPDATED', peerId: event.peerId, trusts: event.trusts});
    else if (event.type === 'OFFER_CREATED') dispatch({type: 'OFFER_SDP_READY', peerId: event.peerId, sdp: event.sdp});
    else if (event.type === 'ANSWER_CREATED') dispatch({type: 'ANSWER_SDP_READY', sdp: event.sdp});
    else if (event.type === 'INTRODUCTION_RECEIVED') dispatch({type: 'INTRODUCTION_RECEIVED', introId: event.introId, from: event.from, peer: event.peer});
    else if (event.type === 'INTRODUCTION_DECLINED') dispatch({type: 'INTRODUCTION_RESOLVED', introId: event.introId});
    else if (event.type === 'INTRODUCTION_EXPIRED') dispatch({type: 'INTRODUCTION_RESOLVED', introId: event.introId});
    else if (event.type === 'SERVER_OFFER_CREATED') dispatch({type: 'RELAY_OFFER', targetPeerId: event.signalingPeerId, sdp: event.sdp});
    else if (event.type === 'SERVER_ANSWER_CREATED') dispatch({type: 'RELAY_ANSWER', targetPeerId: event.signalingPeerId, sdp: event.sdp});
  };

  const handler = createHandler(emit);

  return (action: ConnectionsAction) => {
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
    else if (action.type === 'SERVER_OFFER_RECEIVED') handler.handleCommand({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: action.signalingPeerId, name: action.name, sdp: action.sdp});
    else if (action.type === 'SERVER_ANSWER_RECEIVED') handler.handleCommand({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: action.signalingPeerId, sdp: action.sdp});
  };
};

type EncodingMiddlewareDeps = {
  encodeCode: (sdp: string, passphrase: string) => Promise<string>
  getState: () => ConnectionsState
  dispatch: (action: ConnectionsAction) => void
}

export const createEncodingMiddleware = ({encodeCode, getState, dispatch}: EncodingMiddlewareDeps) =>
  (_: ConnectionsAction) => {
    const {flow} = getState();
    if (flow.phase === 'encoding-offer') {
      const {peerId, sdp, passphrase} = flow;
      encodeCode(sdp, passphrase).then(code => dispatch({type: 'OFFER_ENCODED', peerId, code}));
    } else if (flow.phase === 'encoding-answer') {
      const {sdp, passphrase} = flow;
      encodeCode(sdp, passphrase).then(code => dispatch({type: 'ANSWER_ENCODED', code}));
    }
  };

type CodecMiddlewareDeps = {
  decodeCode: (code: string, passphrase: string) => Promise<Result<string, CodecError>>
  getState: () => ConnectionsState
  dispatch: (action: ConnectionsAction) => void
}

export const createCodecMiddleware = ({decodeCode, getState, dispatch}: CodecMiddlewareDeps) =>
  (action: ConnectionsAction) => {
    if (action.type === 'JOIN_OFFER') {
      decodeCode(action.code, action.passphrase).then(result =>
        result
          .map(sdp => dispatch({type: 'ACCEPT_OFFER', sdp}))
          .onFailure(() => dispatch({type: 'DECODE_FAILED'}))
      );
    } else if (action.type === 'ACCEPT_ANSWER_CODE') {
      const {flow} = getState();
      if (flow.phase === 'offer-ready') {
        decodeCode(action.responseCode, flow.passphrase).then(result =>
          result.map(sdp => dispatch({type: 'ACCEPT_ANSWER', peerId: flow.peerId, sdp}))
        );
      }
    }
  };
