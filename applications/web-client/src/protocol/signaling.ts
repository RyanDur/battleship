import * as Decoder from 'schemawax';
import {maybe} from '../lib/maybe';
import {tryCatch} from '../lib/result';

export type OnlinePeer = {peerId: string; name: string}

export type SignalingEvent =
  | {type: 'PEERS'; peers: OnlinePeer[]}
  | {type: 'PEER_JOINED'; peerId: string; name: string}
  | {type: 'PEER_LEFT'; peerId: string}

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

const peersDecoder = Decoder.object({
  required: {type: Decoder.literal('PEERS'), peers: Decoder.array(peerDecoder)},
});

const peerJoinedDecoder = Decoder.object({
  required: {type: Decoder.literal('PEER_JOINED'), peerId: Decoder.string, name: Decoder.string},
});

const peerLeftDecoder = Decoder.object({
  required: {type: Decoder.literal('PEER_LEFT'), peerId: Decoder.string},
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
          maybe(peersDecoder.decode(parsed)).map(msg =>
            onEvent({type: 'PEERS', peers: msg.peers})
          );
          maybe(peerJoinedDecoder.decode(parsed)).map(msg =>
            onEvent({type: 'PEER_JOINED', peerId: msg.peerId, name: msg.name})
          );
          maybe(peerLeftDecoder.decode(parsed)).map(msg =>
            onEvent({type: 'PEER_LEFT', peerId: msg.peerId})
          );
        });
    };

    currentWs.onclose = () => undefined;
  };

  fetch(config.sessionUrl, {credentials: 'include'})
    .catch(() => undefined)
    .then(() => connect());

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
