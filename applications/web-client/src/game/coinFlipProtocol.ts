import * as Decoder from 'schemawax';
import {maybe} from '../lib/maybe';
import {hashValue} from './hashBoard';
import {turnOrderDecided, coinFlipFailed} from './gameActions';
import type {GameAction} from './game';

const coinFlipCommitDecoder = Decoder.object({required: {type: Decoder.literal('COIN_FLIP_COMMIT'), hash: Decoder.string}});
const coinFlipRevealDecoder = Decoder.object({required: {type: Decoder.literal('COIN_FLIP_REVEAL'), value: Decoder.number}});

type PendingCoinFlip = {
  opponentHash: string
  myValue: number
  iInitiated: boolean
  revealSent: boolean
}

type CoinFlipDeps = {
  sendToPeer: (peerId: string, message: unknown) => void
  getOffererPeerIds: () => string[]
  dispatch: (action: GameAction) => void
}

export type CoinFlipProtocol = {
  start: (peerId: string) => void
  handleMessage: (peerId: string, data: unknown) => void
}

export const createCoinFlipProtocol = (deps: CoinFlipDeps): CoinFlipProtocol => {
  const pending = new Map<string, PendingCoinFlip>();

  const resolveTurn = (peerId: string, flip: PendingCoinFlip, opponentValue: number) => {
    const merged = flip.myValue ^ opponentValue;
    const isOfferer = deps.getOffererPeerIds().includes(peerId);
    const iGoFirst = isOfferer ? (merged % 2) === 0 : (merged % 2) !== 0;
    deps.dispatch(turnOrderDecided(iGoFirst));
  };

  const handleCommit = (peerId: string, hash: string) => {
    const existing = pending.get(peerId);
    if (existing?.iInitiated) {
      // Simultaneous: both sent COMMIT. Offerer yields initiator role to answerer.
      const iInitiated = !deps.getOffererPeerIds().includes(peerId);
      pending.set(peerId, {...existing, opponentHash: hash, iInitiated, revealSent: true});
      deps.sendToPeer(peerId, {type: 'COIN_FLIP_REVEAL', value: existing.myValue});
    } else {
      const myValue = Math.floor(Math.random() * 0xFFFFFFFF);
      pending.set(peerId, {opponentHash: hash, myValue, iInitiated: false, revealSent: true});
      deps.sendToPeer(peerId, {type: 'COIN_FLIP_REVEAL', value: myValue});
    }
  };

  const handleReveal = (peerId: string, value: number) => {
    const flip = pending.get(peerId);
    if (!flip) return;
    pending.delete(peerId);
    if (flip.iInitiated && !flip.revealSent) {
      deps.sendToPeer(peerId, {type: 'COIN_FLIP_REVEAL', value: flip.myValue});
    }
    if (flip.opponentHash) {
      hashValue(value.toString())
        .onSuccess(hash => {
          if (hash !== flip.opponentHash) {
            deps.dispatch(coinFlipFailed());
            return;
          }
          resolveTurn(peerId, flip, value);
        })
        .onFailure(() => deps.dispatch(coinFlipFailed()));
    } else {
      resolveTurn(peerId, flip, value);
    }
  };

  return {
    start: (peerId) => {
      const myValue = Math.floor(Math.random() * 0xFFFFFFFF);
      // Store synchronously before async hash — a peer's COMMIT can arrive during hash computation
      pending.set(peerId, {opponentHash: '', myValue, iInitiated: true, revealSent: false});
      hashValue(myValue.toString())
        .onSuccess(hash => {
          const existing = pending.get(peerId);
          if (!existing || existing.revealSent) return; // simultaneous already handled
          deps.sendToPeer(peerId, {type: 'COIN_FLIP_COMMIT', hash});
        })
        .onFailure(() => { pending.delete(peerId); });
    },
    handleMessage: (peerId, data) => {
      // Silently ignores non-coin-flip messages (port delivers all peer messages)
      maybe(coinFlipCommitDecoder.decode(data))
        .map(msg => handleCommit(peerId, msg.hash))
        .or(() => maybe(coinFlipRevealDecoder.decode(data))
          .map(msg => handleReveal(peerId, msg.value)));
    },
  };
};
