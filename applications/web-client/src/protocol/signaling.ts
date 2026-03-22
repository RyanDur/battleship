import * as Decoder from 'schemawax';
import {maybe} from '../lib/maybe';
import {tryCatch} from '../lib/result';
import {asyncTryCatch} from '../lib/asyncResult';
import type {PreviousPeer, GameState, Shot, GamePhase} from '../state/connections';
import type {Board} from '../game/board';

export type OnlinePeer = {peerId: string; name: string}

export type SignalingEvent =
  | {type: 'REGISTERED'}
  | {type: 'PEERS'; peers: OnlinePeer[]}
  | {type: 'PEER_JOINED'; peerId: string; name: string}
  | {type: 'PEER_LEFT'; peerId: string}
  | {type: 'OFFER_RECEIVED'; fromPeerId: string; name: string; sdp: string}
  | {type: 'ANSWER_RECEIVED'; fromPeerId: string; sdp: string}
  | {type: 'PREVIOUS_PEERS'; peers: PreviousPeer[]}
  | {type: 'ICE_RESTART_RECEIVED'; fromPeerId: string; sdp: string}
  | {type: 'ICE_RESTART_ANSWER_RECEIVED'; fromPeerId: string; sdp: string}
  | {type: 'EMAIL_SHARED'; fromPeerId: string; email: string}
  | {type: 'EMAIL_REVOKED'; fromPeerId: string}
  | {type: 'BOARD_SAVED'}
  | {type: 'BOARD_LOADED'; board: Board}
  | {type: 'BOARD_NOT_FOUND'}
  | {type: 'GAME_STARTED'; gameState: GameState}
  | {type: 'FIRE_RESULT'; playerShot: Shot; aiShot: Shot | null; phase: GamePhase}
  | {type: 'GAME_STATE'; gameState: GameState}
  | {type: 'GAME_NOT_FOUND'}

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

const registeredDecoder = Decoder.object({required: {type: Decoder.literal('REGISTERED')}});

const peerDecoder = Decoder.object({required: {peerId: Decoder.string, name: Decoder.string}});

const previousPeerDecoder = Decoder.object({
  required: {peerId: Decoder.string, name: Decoder.string, online: Decoder.boolean},
  optional: {email: Decoder.string},
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

const emailSharedDecoder = Decoder.object({
  required: {type: Decoder.literal('EMAIL_SHARED'), fromPeerId: Decoder.string, email: Decoder.string},
});

const emailRevokedDecoder = Decoder.object({
  required: {type: Decoder.literal('EMAIL_REVOKED'), fromPeerId: Decoder.string},
});

const boardSavedDecoder = Decoder.object({required: {type: Decoder.literal('BOARD_SAVED')}});
const boardNotFoundDecoder = Decoder.object({required: {type: Decoder.literal('BOARD_NOT_FOUND')}});
const boardLoadedDecoder = Decoder.object({required: {type: Decoder.literal('BOARD_LOADED'), board: Decoder.string}});
const gameNotFoundDecoder = Decoder.object({required: {type: Decoder.literal('GAME_NOT_FOUND')}});

const cellDecoder = Decoder.object({required: {row: Decoder.number, col: Decoder.number}});
const shipInfoDecoder = Decoder.object({required: {name: Decoder.string, size: Decoder.number}});
const shotDecoder = Decoder.object({required: {cell: cellDecoder, result: Decoder.string}, optional: {ship: shipInfoDecoder}});
const gameStartedDecoder = Decoder.object({
  required: {type: Decoder.literal('GAME_STARTED'), playerShots: Decoder.array(shotDecoder), aiShots: Decoder.array(shotDecoder), phase: Decoder.string},
});
const gameStateMessageDecoder = Decoder.object({
  required: {type: Decoder.literal('GAME_STATE'), playerShots: Decoder.array(shotDecoder), aiShots: Decoder.array(shotDecoder), phase: Decoder.string},
});
const fireResultDecoder = Decoder.object({
  required: {type: Decoder.literal('FIRE_RESULT'), playerShot: shotDecoder, phase: Decoder.string},
  optional: {aiShot: shotDecoder},
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
        .onSuccess(parsed => {
          maybe(registeredDecoder.decode(parsed)).map(() => onEvent({type: 'REGISTERED'}))
            .or(() => maybe(peersDecoder.decode(parsed)).map(msg => onEvent({type: 'PEERS', peers: msg.peers})))
            .or(() => maybe(peerJoinedDecoder.decode(parsed)).map(msg => onEvent({type: 'PEER_JOINED', peerId: msg.peerId, name: msg.name})))
            .or(() => maybe(peerLeftDecoder.decode(parsed)).map(msg => onEvent({type: 'PEER_LEFT', peerId: msg.peerId})))
            .or(() => maybe(offerReceivedDecoder.decode(parsed)).map(msg => onEvent({type: 'OFFER_RECEIVED', fromPeerId: msg.fromPeerId, name: msg.name, sdp: msg.sdp})))
            .or(() => maybe(answerReceivedDecoder.decode(parsed)).map(msg => onEvent({type: 'ANSWER_RECEIVED', fromPeerId: msg.fromPeerId, sdp: msg.sdp})))
            .or(() => maybe(previousPeersDecoder.decode(parsed)).map(msg => onEvent({type: 'PREVIOUS_PEERS', peers: msg.peers})))
            .or(() => maybe(iceRestartReceivedDecoder.decode(parsed)).map(msg => onEvent({type: 'ICE_RESTART_RECEIVED', fromPeerId: msg.fromPeerId, sdp: msg.sdp})))
            .or(() => maybe(iceRestartAnswerReceivedDecoder.decode(parsed)).map(msg => onEvent({type: 'ICE_RESTART_ANSWER_RECEIVED', fromPeerId: msg.fromPeerId, sdp: msg.sdp})))
            .or(() => maybe(emailSharedDecoder.decode(parsed)).map(msg => onEvent({type: 'EMAIL_SHARED', fromPeerId: msg.fromPeerId, email: msg.email})))
            .or(() => maybe(emailRevokedDecoder.decode(parsed)).map(msg => onEvent({type: 'EMAIL_REVOKED', fromPeerId: msg.fromPeerId})))
            .or(() => maybe(boardSavedDecoder.decode(parsed)).map(() => onEvent({type: 'BOARD_SAVED'})))
            .or(() => maybe(boardNotFoundDecoder.decode(parsed)).map(() => onEvent({type: 'BOARD_NOT_FOUND'})))
            .or(() => maybe(boardLoadedDecoder.decode(parsed)).map(msg => {
              tryCatch(() => JSON.parse(msg.board), () => null)
                .onSuccess(board => { if (board) onEvent({type: 'BOARD_LOADED', board}); });
            }))
            .or(() => maybe(gameNotFoundDecoder.decode(parsed)).map(() => onEvent({type: 'GAME_NOT_FOUND'})))
            .or(() => maybe(gameStartedDecoder.decode(parsed)).map(msg =>
              onEvent({type: 'GAME_STARTED', gameState: {playerShots: msg.playerShots as Shot[], aiShots: msg.aiShots as Shot[], phase: msg.phase as GamePhase}})
            ))
            .or(() => maybe(gameStateMessageDecoder.decode(parsed)).map(msg =>
              onEvent({type: 'GAME_STATE', gameState: {playerShots: msg.playerShots as Shot[], aiShots: msg.aiShots as Shot[], phase: msg.phase as GamePhase}})
            ))
            .or(() => maybe(fireResultDecoder.decode(parsed)).map(msg => onEvent({
              type: 'FIRE_RESULT',
              playerShot: msg.playerShot as Shot,
              aiShot: msg.aiShot ? msg.aiShot as Shot : null,
              phase: msg.phase as GamePhase,
            })));
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
