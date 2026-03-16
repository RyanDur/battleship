import * as Decoder from 'schemawax';
import {maybe} from '../lib/maybe';
import {tryCatch} from '../lib/result';
import {asyncTryCatch} from '../lib/asyncResult';
import type {PreviousPeer} from '../state/connections';

export type OnlinePeer = {peerId: string; name: string}

export type SignalingEvent =
  | {type: 'PEERS'; peers: OnlinePeer[]}
  | {type: 'PEER_JOINED'; peerId: string; name: string}
  | {type: 'PEER_LEFT'; peerId: string}
  | {type: 'OFFER_RECEIVED'; fromPeerId: string; name: string; sdp: string}
  | {type: 'ANSWER_RECEIVED'; fromPeerId: string; sdp: string}
  | {type: 'PREVIOUS_PEERS'; peers: PreviousPeer[]}
  | {type: 'ICE_RESTART_RECEIVED'; fromPeerId: string; sdp: string}
  | {type: 'ICE_RESTART_ANSWER_RECEIVED'; fromPeerId: string; sdp: string}

export type SignalingHandle = {
  stop: () => void
  send: (message: Record<string, unknown>) => void
}

export type SignalingConfig = {
  createWebSocket: (url: string) => WebSocket
  sessionUrl: string
  url: string
  name: string
}

const peerDecoder = Decoder.object({required: {peerId: Decoder.string, name: Decoder.string}});

const previousPeerDecoder = Decoder.object({
  required: {peerId: Decoder.string, name: Decoder.string, online: Decoder.boolean},
});

const peersDecoder = Decoder.object({
  required: {type: Decoder.literal('PEERS'), peers: Decoder.array(peerDecoder)},
});

const peerJoinedDecoder = Decoder.object({
  required: {type: Decoder.literal('PEER_JOINED'), peerId: Decoder.string, name: Decoder.string},
});

const peerLeftDecoder = Decoder.object({
  required: {type: Decoder.literal('PEER_LEFT'), peerId: Decoder.string},
});

const offerReceivedDecoder = Decoder.object({
  required: {type: Decoder.literal('OFFER_RECEIVED'), fromPeerId: Decoder.string, name: Decoder.string, sdp: Decoder.string},
});

const answerReceivedDecoder = Decoder.object({
  required: {type: Decoder.literal('ANSWER_RECEIVED'), fromPeerId: Decoder.string, sdp: Decoder.string},
});

const previousPeersDecoder = Decoder.object({
  required: {type: Decoder.literal('PREVIOUS_PEERS'), peers: Decoder.array(previousPeerDecoder)},
});

const iceRestartReceivedDecoder = Decoder.object({
  required: {type: Decoder.literal('ICE_RESTART_RECEIVED'), fromPeerId: Decoder.string, sdp: Decoder.string},
});

const iceRestartAnswerReceivedDecoder = Decoder.object({
  required: {type: Decoder.literal('ICE_RESTART_ANSWER_RECEIVED'), fromPeerId: Decoder.string, sdp: Decoder.string},
});

export const startSignaling = (
  config: SignalingConfig,
  onEvent: (event: SignalingEvent) => void
): SignalingHandle => {
  let generation = 0;
  let ws: WebSocket | null = null;

  const connect = () => {
    const gen = generation;
    const currentWs = config.createWebSocket(config.url);
    ws = currentWs;

    currentWs.onerror = () => undefined;

    currentWs.onopen = () => {
      if (gen !== generation) return;
      currentWs.send(JSON.stringify({type: 'REGISTER', name: config.name}));
    };

    currentWs.onmessage = (event: MessageEvent) => {
      if (gen !== generation) return;
      tryCatch(() => JSON.parse(event.data as string), () => 'invalid json')
        .onFailure(() => console.warn('Received malformed signaling message'))
        .onSuccess(parsed => {
          maybe(peersDecoder.decode(parsed)).map(msg => onEvent({type: 'PEERS', peers: msg.peers}))
            .or(() => maybe(peerJoinedDecoder.decode(parsed)).map(msg => onEvent({type: 'PEER_JOINED', peerId: msg.peerId, name: msg.name})))
            .or(() => maybe(peerLeftDecoder.decode(parsed)).map(msg => onEvent({type: 'PEER_LEFT', peerId: msg.peerId})))
            .or(() => maybe(offerReceivedDecoder.decode(parsed)).map(msg => onEvent({type: 'OFFER_RECEIVED', fromPeerId: msg.fromPeerId, name: msg.name, sdp: msg.sdp})))
            .or(() => maybe(answerReceivedDecoder.decode(parsed)).map(msg => onEvent({type: 'ANSWER_RECEIVED', fromPeerId: msg.fromPeerId, sdp: msg.sdp})))
            .or(() => maybe(previousPeersDecoder.decode(parsed)).map(msg => onEvent({type: 'PREVIOUS_PEERS', peers: msg.peers})))
            .or(() => maybe(iceRestartReceivedDecoder.decode(parsed)).map(msg => onEvent({type: 'ICE_RESTART_RECEIVED', fromPeerId: msg.fromPeerId, sdp: msg.sdp})))
            .or(() => maybe(iceRestartAnswerReceivedDecoder.decode(parsed)).map(msg => onEvent({type: 'ICE_RESTART_ANSWER_RECEIVED', fromPeerId: msg.fromPeerId, sdp: msg.sdp})));
        });
    };

    currentWs.onclose = () => undefined;
  };

  asyncTryCatch(() => fetch(config.sessionUrl, {credentials: 'include'}))
    .onComplete(() => connect());

  return {
    stop: () => {
      generation++;
      ws?.close();
    },
    send: (message) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
  };
};
