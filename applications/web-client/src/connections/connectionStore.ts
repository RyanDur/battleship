import {connectionsReducer, initialState} from './connections';
import type {ConnectionsState, ConnectionsAction} from './connections';
import {transportReducer, transportInitialState} from '../transport/transport';
import type {TransportState, TransportAction} from '../transport/transport';
import {createDispatch} from '../lib/maybe';
import {selectIntroChannels, selectIsCreatingOffer, selectPeerToSignaling} from '../transport/transportSelectors';
import {selectPeers} from './connectionSelectors';
import {selectFlow} from '../transport/transportSelectors';
import {peerConnected, previousPeerConnected, peerNamed, peerDisconnected, peerTrustUpdated, introductionReceived, introductionResolved, onlinePeersUpdated, onlinePeerJoined, onlinePeerLeft, previousPeersReceived, emailSharedReceived, emailRevokedReceived, messageReceived} from './connectionActions';
import {offerSdpReady, answerSdpReady, relayOffer, relayAnswer, peerConnectionUnstable, peerConnectionRestored, relayIceRestart, relayIceRestartAnswer, offerFailed, offerEncoded, answerEncoded, acceptOffer, decodeFailed, acceptAnswer, serverOfferReceived, serverAnswerReceived, iceRestartReceived, iceRestartAnswerReceived, peerMessageReceived} from '../transport/transportActions';
import type {PeerEvent} from '../transport/connectionHandler';
import {encodeConnectionCode, decodeConnectionCode} from '../transport/connectionCode';
import {createPeerHandler} from '../transport/connectionHandler';
import {startSignaling} from '../transport/signaling';
import type {ConnectionEvent} from '../transport/connectionPort';
import type {SignalingConfig, SignalingEvent, SignalingHandle} from '../transport/signaling';
import {createStore, applyMiddleware as createStoreApplyMiddleware} from '../state/createStore';
import type {Store, MiddlewareFactory as GenericMiddlewareFactory, ListenerFactory as GenericListenerFactory} from '../state/createStore';

export type CombinedState = {connections: ConnectionsState; transport: TransportState}
export type CombinedAction = ConnectionsAction | TransportAction

export type ListenerContext = {
  prevState: CombinedState
  state: CombinedState
  dispatch: (action: CombinedAction) => void
  getState: () => CombinedState
}

export type ListenerFn = (action: CombinedAction, context: ListenerContext) => void

export type ConnectionStore = Store<CombinedState, CombinedAction>

export type MiddlewareFactory = GenericMiddlewareFactory<CombinedState, CombinedAction>
export type ListenerFactory = GenericListenerFactory<CombinedState, CombinedAction>

export const applyMiddleware = (factories: MiddlewareFactory[]): MiddlewareFactory =>
  createStoreApplyMiddleware(factories);

export const combinedInitialState: CombinedState = {connections: initialState, transport: transportInitialState};

const connectionsSlice = {
  name: 'connections' as const,
  initialState,
  reducer: (state: CombinedState, action: {type: string}): ConnectionsState =>
    connectionsReducer({...state.connections, handlerState: state.transport.handlerState}, action),
};

const transportSlice = {
  name: 'transport' as const,
  initialState: transportInitialState,
  reducer: (state: CombinedState, action: {type: string}): TransportState =>
    transportReducer(state.transport, action),
};

export const createConnectionStore = (middlewareFactory?: MiddlewareFactory, listenerFactories?: ListenerFactory[]): ConnectionStore =>
  createStore(
    [connectionsSlice, transportSlice],
    listenerFactories,
    middlewareFactory,
  );

type HandlerListenerConfig = {
  name: string
  createPeerConnection: () => RTCPeerConnection
  portEmit?: (event: ConnectionEvent) => void
}

const makeHandlerEmit = (dispatch: (action: CombinedAction) => void, getState: () => CombinedState, portEmit?: (event: ConnectionEvent) => void) => {
  const dispatchPeerEvent = createDispatch<PeerEvent>({
    PEER_CONNECTED: (event) => {
      dispatch(peerConnected(event.peerId));
      if (event.isOfferer) {
        const signalingPeerId = selectPeerToSignaling(getState())[event.peerId];
        if (signalingPeerId) dispatch(previousPeerConnected(signalingPeerId));
      }
      portEmit?.({type: 'PEER_CONNECTED', peerId: event.peerId, isOfferer: event.isOfferer});
    },
    PEER_NAMED: (event) => {
      dispatch(peerNamed(event.peerId, event.name));
      portEmit?.({type: 'PEER_NAMED', peerId: event.peerId, name: event.name});
    },
    PEER_DISCONNECTED: (event) => {
      dispatch(peerDisconnected(event.peerId));
      portEmit?.({type: 'PEER_DISCONNECTED', peerId: event.peerId});
    },
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

export const createHandlerListener = ({name, createPeerConnection, portEmit}: HandlerListenerConfig): ListenerFactory =>
  ({dispatch, getState}) => {
    const emit = makeHandlerEmit(dispatch, getState, portEmit);
    const emitToPort = (event: ConnectionEvent) => {
      portEmit?.(event);
      if (event.type === 'PEER_MESSAGE') dispatch(peerMessageReceived(event.peerId, event.data));
    };
    const handler = createPeerHandler({name, createPeerConnection, emit, emitToPort, dispatch, getState, getPeerName: (peerId) => selectPeers(getState()).find(p => p.id === peerId)?.name});

    return (action, {prevState}) => {
      const dispatchHandlerCommand = createDispatch<CombinedAction>({
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
          portEmit?.({type: 'PEER_DISCONNECTED', peerId: action.peerId});
        },
      });

      dispatchHandlerCommand(action);
    };
  };


export const encodingMiddleware: MiddlewareFactory =
  ({dispatch, getState}) => (next) =>
    (action: CombinedAction) => {
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
    (action: CombinedAction) => {
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

export const createTransportDeliveryListener = (sendToServer: (message: unknown) => void): ListenerFactory =>
  () => (action) => {
    if (action.type === 'DELIVER_TO_SERVER') sendToServer(action.message);
  };

type SignalingListenerConfig = {
  config: SignalingConfig
  portEmit?: (event: ConnectionEvent) => void
  onReady?: (handle: {send: (message: unknown) => void}) => void
}

export const createSignalingListener = ({config, portEmit, onReady}: SignalingListenerConfig): ListenerFactory =>
  ({dispatch}) => {
    let handle: SignalingHandle | null = null;

    const dispatchSignalingEvent = createDispatch<SignalingEvent>({
      REGISTERED: () => {
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
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_SAVED'}});
      },
      BOARD_LOADED: (event) => {
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_LOADED', board: event.board}});
      },
      BOARD_NOT_FOUND: () => {
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'BOARD_NOT_FOUND'}});
      },
      GAME_STARTED: (event) => {
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_STARTED', gameState: event.gameState}});
      },
      FIRE_RESULT: (event) => {
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'FIRE_RESULT', playerShot: event.playerShot, aiShot: event.aiShot, phase: event.phase}});
      },
      GAME_STATE: (event) => {
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_STATE', gameState: event.gameState}});
      },
      GAME_NOT_FOUND: () => {
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'GAME_NOT_FOUND'}});
      },
      P2P_GAME_LOADED: (event) => {
        portEmit?.({type: 'SERVER_MESSAGE', data: {type: 'P2P_GAME_LOADED', gameState: event.gameState}});
      },
      SIGNALING_ERROR: () => {
        portEmit?.({type: 'TRANSPORT_ERROR', message: 'Lost connection to server'});
      },
      SIGNALING_CLOSED: () => {
        portEmit?.({type: 'TRANSPORT_ERROR', message: 'Connection to server closed unexpectedly'});
      },
    });

    const dispatchSignalingAction = createDispatch<CombinedAction>({
      START_SIGNALING: () => {
        handle = startSignaling(config, dispatchSignalingEvent);
        onReady?.({send: (msg) => handle?.send(msg as Record<string, unknown>)});
      },
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
    });

    return (action) => dispatchSignalingAction(action);
  };
