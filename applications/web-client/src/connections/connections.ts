import {createReducer} from '../lib/maybe';
import type {OnlinePeer, PreviousPeer} from '../transport/signaling';
import type {HandlerState} from '../transport/transport';

export type {OnlinePeer, PreviousPeer};

export type Peer = {id: string; name?: string; trusted?: boolean; trustsMe?: boolean}

export type PendingIntroduction = {introId: string; from: string; peer: string}

export type Message = {peerId: string; text: string; fromSelf: boolean}

export type ConnectionsState = {
  peers: Peer[]
  messages: Message[]
  pendingIntroductions: PendingIntroduction[]
  onlinePeers: OnlinePeer[]
  previousPeers: PreviousPeer[]
}

export type ConnectionsAction =
  | {type: 'PEER_CONNECTED'; peerId: string}
  | {type: 'PEER_DISCONNECTED'; peerId: string}
  | {type: 'PEER_NAMED'; peerId: string; name: string}
  | {type: 'GRANT_TRUST'; peerId: string}
  | {type: 'REVOKE_TRUST'; peerId: string}
  | {type: 'PEER_TRUST_UPDATED'; peerId: string; trusts: boolean}
  | {type: 'INTRODUCTION_RECEIVED'; introId: string; from: string; peer: string}
  | {type: 'INTRODUCTION_RESOLVED'; introId: string}
  | {type: 'ACCEPT_INTRODUCTION'; introId: string}
  | {type: 'DECLINE_INTRODUCTION'; introId: string}
  | {type: 'ONLINE_PEERS_UPDATED'; peers: OnlinePeer[]}
  | {type: 'ONLINE_PEER_JOINED'; peerId: string; name: string}
  | {type: 'ONLINE_PEER_LEFT'; peerId: string}
  | {type: 'DISCONNECT'; peerId: string}
  | {type: 'INTRODUCE_PEERS'; peerId1: string; peerId2: string}
  | {type: 'PREVIOUS_PEERS_RECEIVED'; peers: PreviousPeer[]}
  | {type: 'PREVIOUS_PEER_CONNECTED'; signalingPeerId: string}
  | {type: 'FORGET_PEER'; peerId: string}
  | {type: 'EMAIL_SHARED_RECEIVED'; fromPeerId: string; email: string}
  | {type: 'EMAIL_REVOKED_RECEIVED'; fromPeerId: string}
  | {type: 'SHARE_EMAIL'; targetPeerId: string}
  | {type: 'STOP_SHARING_EMAIL'; targetPeerId: string}
  | {type: 'UPDATE_EMAIL'; email: string}
  | {type: 'SAVE_PEER_EMAIL'; peerId: string; email: string}
  | {type: 'MESSAGE_RECEIVED'; peerId: string; text: string}
  | {type: 'SEND_MESSAGE'; peerId: string; text: string}
  | {type: 'SEND_TO_PEER'; peerId: string; message: Record<string, unknown>}

export const initialState: ConnectionsState = {
  peers: [],
  messages: [],
  pendingIntroductions: [],
  onlinePeers: [],
  previousPeers: [],
};

type StateWithHandlerState = ConnectionsState & {handlerState: HandlerState}

export const connectionsReducer = createReducer<StateWithHandlerState, ConnectionsAction, {type: string}>({
  PEER_CONNECTED: (state, action) => ({
    ...state,
    peers: [...state.peers, {id: action.peerId}],
  }),
  PEER_DISCONNECTED: (state, action) => {
    const signalingPeerId = state.handlerState.peerToSignaling[action.peerId];
    const peerName = state.peers.find(p => p.id === action.peerId)?.name;
    const alreadyInPrevious = signalingPeerId ? state.previousPeers.some(p => p.peerId === signalingPeerId) : true;
    const updatedPreviousPeers = signalingPeerId && peerName && !alreadyInPrevious
      ? [...state.previousPeers, {peerId: signalingPeerId, name: peerName, online: false}]
      : state.previousPeers;
    return {
      ...state,
      peers: state.peers.filter(p => p.id !== action.peerId),
      previousPeers: updatedPreviousPeers,
    };
  },
  PEER_NAMED: (state, action) => ({...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, name: action.name} : p)}),
  GRANT_TRUST: (state, action) => ({...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trusted: true} : p)}),
  REVOKE_TRUST: (state, action) => ({...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trusted: false} : p)}),
  PEER_TRUST_UPDATED: (state, action) => ({...state, peers: state.peers.map(p => p.id === action.peerId ? {...p, trustsMe: action.trusts} : p)}),
  INTRODUCTION_RECEIVED: (state, action) => ({...state, pendingIntroductions: [...state.pendingIntroductions, {introId: action.introId, from: action.from, peer: action.peer}]}),
  INTRODUCTION_RESOLVED: (state, action) => ({...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)}),
  ACCEPT_INTRODUCTION: (state, action) => ({...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)}),
  DECLINE_INTRODUCTION: (state, action) => ({...state, pendingIntroductions: state.pendingIntroductions.filter(i => i.introId !== action.introId)}),
  ONLINE_PEERS_UPDATED: (state, action) => ({...state, onlinePeers: action.peers}),
  ONLINE_PEER_JOINED: (state, action) => ({
    ...state,
    onlinePeers: [...state.onlinePeers, {peerId: action.peerId, name: action.name}],
    previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, online: true} : p),
  }),
  ONLINE_PEER_LEFT: (state, action) => ({
    ...state,
    onlinePeers: state.onlinePeers.filter(p => p.peerId !== action.peerId),
    previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, online: false} : p),
  }),
  PREVIOUS_PEERS_RECEIVED: (state, action) => ({...state, previousPeers: action.peers}),
  PREVIOUS_PEER_CONNECTED: (state, action) => ({...state, previousPeers: state.previousPeers.filter(p => p.peerId !== action.signalingPeerId)}),
  FORGET_PEER: (state, action) => ({...state, previousPeers: state.previousPeers.filter(p => p.peerId !== action.peerId)}),
  EMAIL_SHARED_RECEIVED: (state, action) => ({...state, previousPeers: state.previousPeers.map(p => p.peerId === action.fromPeerId ? {...p, email: action.email} : p)}),
  EMAIL_REVOKED_RECEIVED: (state, action) => ({...state, previousPeers: state.previousPeers.map(p =>
    p.peerId !== action.fromPeerId ? p : {peerId: p.peerId, name: p.name, online: p.online}
  )}),
  SAVE_PEER_EMAIL: (state, action) => ({...state, previousPeers: state.previousPeers.map(p => p.peerId === action.peerId ? {...p, email: action.email} : p)}),
  MESSAGE_RECEIVED: (state, action) => ({...state, messages: [...state.messages, {peerId: action.peerId, text: action.text, fromSelf: false}]}),
  SEND_MESSAGE: (state, action) => ({...state, messages: [...state.messages, {peerId: action.peerId, text: action.text, fromSelf: true}]}),
});
