import * as Decoder from 'schemawax';
import { maybe } from '../lib/maybe';
import { tryCatch } from '../lib/result';
import { asyncResult, asyncTryCatch } from '../lib/asyncResult';
import type { PeerCommand, PeerEvent } from '../types/worker-messages';
import type { ConnectionsState, ConnectionsAction, Shot } from '../state/connections';
import {selectOffererPeerIds, selectPeerToSignaling, selectIceRestartAttempts, selectPeerConnectionHealth, selectIntroConnections, selectIntroChannels, selectPeers, selectSignalingToPeer, selectP2pGame, selectBoard} from '../state/connectionSelectors';
import {challengeReceived, acceptChallenge, declineChallenge, cancelChallenge, opponentBoardReady, turnOrderDecided, p2pFireResult, opponentFired, p2pGameOver, opponentForfeited, p2pStateMismatch, p2pStateSync} from '../state/connectionActions';
import {occupiedCells, isCellOccupied} from '../game/board';
import {introConnectionCleared, iceRestartAttempted, introChannelRegistered, introConnectionRegistered, signalingPeerRegistered, offerFailed} from '../state/connectionActions';

const introduceDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCE'), name: Decoder.string },
});

const trustDecoder = Decoder.object({
  required: { type: Decoder.literal('TRUST'), granted: Decoder.boolean },
});

const introductionDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION'), introId: Decoder.string, from: Decoder.string, peer: Decoder.string },
});

const introductionResponseDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_RESPONSE'), introId: Decoder.string, accepted: Decoder.boolean },
});

const createOfferForDecoder = Decoder.object({
  required: { type: Decoder.literal('CREATE_OFFER_FOR'), introId: Decoder.string },
});

const relaySdpDecoder = Decoder.object({
  required: { type: Decoder.literal('RELAY_SDP'), introId: Decoder.string, peerId: Decoder.string, sdp: Decoder.string },
});

const relaySdpAnswerDecoder = Decoder.object({
  required: { type: Decoder.literal('RELAY_SDP_ANSWER'), introId: Decoder.string, sdp: Decoder.string },
});

const introductionSdpDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_SDP'), introId: Decoder.string, sdp: Decoder.string },
});

const introductionSdpAnswerDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_SDP_ANSWER'), introId: Decoder.string, peerId: Decoder.string, sdp: Decoder.string },
});

const introductionDeclinedDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_DECLINED'), introId: Decoder.string },
});

const introductionExpiredDecoder = Decoder.object({
  required: { type: Decoder.literal('INTRODUCTION_EXPIRED'), introId: Decoder.string },
});

const chatDecoder = Decoder.object({
  required: { type: Decoder.literal('CHAT'), text: Decoder.string },
});

const gameChallengeDecoder = Decoder.object({required: {type: Decoder.literal('GAME_CHALLENGE')}});
const gameAcceptDecoder = Decoder.object({required: {type: Decoder.literal('GAME_ACCEPT')}});
const gameDeclineDecoder = Decoder.object({required: {type: Decoder.literal('GAME_DECLINE')}});
const gameCancelDecoder = Decoder.object({required: {type: Decoder.literal('GAME_CANCEL')}});
const boardReadyDecoder = Decoder.object({required: {type: Decoder.literal('BOARD_READY'), boardHash: Decoder.string}});
const coinFlipCommitDecoder = Decoder.object({required: {type: Decoder.literal('COIN_FLIP_COMMIT'), hash: Decoder.string}});
const coinFlipRevealDecoder = Decoder.object({required: {type: Decoder.literal('COIN_FLIP_REVEAL'), value: Decoder.number}});
const p2pFireDecoder = Decoder.object({required: {type: Decoder.literal('FIRE'), row: Decoder.number, col: Decoder.number}});
const p2pCellDecoder = Decoder.object({required: {row: Decoder.number, col: Decoder.number}});
const p2pShipInfoDecoder = Decoder.object({required: {name: Decoder.string, size: Decoder.number}});
const shotResultDecoder = Decoder.oneOf(Decoder.literal('hit'), Decoder.literal('miss'), Decoder.literal('sunk'));
const p2pFireResultDecoder = Decoder.object({
  required: {type: Decoder.literal('FIRE_RESULT'), row: Decoder.number, col: Decoder.number, result: shotResultDecoder},
  optional: {ship: p2pShipInfoDecoder},
});
const gameForfeitDecoder = Decoder.object({required: {type: Decoder.literal('GAME_FORFEIT')}});
const p2pShotDecoder = Decoder.object({
  required: {cell: p2pCellDecoder, result: shotResultDecoder},
  optional: {ship: p2pShipInfoDecoder},
});
const gameStateSyncDecoder = Decoder.object({
  required: {
    type: Decoder.literal('GAME_STATE_SYNC'),
    phase: Decoder.string,
    myShots: Decoder.array(p2pShotDecoder),
    opponentShots: Decoder.array(p2pShotDecoder),
  },
});

const TOTAL_SHIPS = 5;
const isFleetSunk = (shots: Shot[]): boolean =>
  new Set(shots.filter(s => s.result === 'sunk' && s.ship).map(s => s.ship!.name)).size >= TOTAL_SHIPS;

const resolveP2pShot = (board: NonNullable<ReturnType<typeof selectBoard>>, prevShots: Shot[], cell: {row: number; col: number}): Shot => {
  const hit = isCellOccupied(board, cell);
  if (!hit) return {cell, result: 'miss'};
  const placedShip = board.placed.find(p => occupiedCells(p).some(c => c.row === cell.row && c.col === cell.col));
  if (!placedShip) return {cell, result: 'hit'};
  const allCells = occupiedCells(placedShip);
  const hitCells = [...prevShots.map(s => s.cell), cell];
  const isSunk = allCells.every(c => hitCells.some(h => h.row === c.row && h.col === c.col));
  return isSunk
    ? {cell, result: 'sunk', ship: {name: placedShip.ship.name, size: placedShip.ship.size}}
    : {cell, result: 'hit'};
};

type Deps = {
  name: string
  emit: (event: PeerEvent) => void
  createPeerConnection: () => RTCPeerConnection
  getState: () => ConnectionsState
  dispatch: (action: ConnectionsAction) => void
}

type Handler = {
  handleCommand: (command: PeerCommand) => void
  cleanup: (peerId: string) => void
}

const generatePeerId = (): string => crypto.randomUUID();

const ICE_GATHER_TIMEOUT_MS = 5000;

const gatherIceCandidates = (pc: RTCPeerConnection): Promise<string | undefined> =>
  new Promise((resolve) => {
    const checkComplete = () => resolve(pc.localDescription?.sdp);
    if (pc.iceGatheringState === 'complete') { checkComplete(); return; }
    const timeoutId = setTimeout(checkComplete, ICE_GATHER_TIMEOUT_MS);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate === null) { clearTimeout(timeoutId); checkComplete(); }
    };
  });

type ChannelCallbacks = {
  onOpen: (peerId: string, channel: RTCDataChannel) => void
  onClose: (peerId: string) => void
  onMessage: (peerId: string, parsed: unknown) => void
}

const wireChannel = (channel: RTCDataChannel, peerId: string, name: string, emit: (event: PeerEvent) => void, cbs: ChannelCallbacks) => {
  channel.onopen = () => {
    cbs.onOpen(peerId, channel);
    emit({ type: 'PEER_CONNECTED', peerId });
    channel.send(JSON.stringify({ type: 'INTRODUCE', name }));
  };
  channel.onclose = () => cbs.onClose(peerId);
  channel.onmessage = ({ data }: MessageEvent<string>) => {
    tryCatch(() => JSON.parse(data), () => 'invalid json')
      .onFailure(() => console.warn('Received malformed message from peer'))
      .onSuccess(parsed => cbs.onMessage(peerId, parsed));
  };
};

const createOfferSdp = (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, cbs: ChannelCallbacks) => {
  const channel = pc.createDataChannel('game');
  wireChannel(channel, peerId, name, emit, cbs);
  return asyncTryCatch(() => pc.createOffer())
    .andThen(offer => asyncTryCatch(() => pc.setLocalDescription(offer)))
    .andThen(() => asyncResult<string | undefined, Error>(gatherIceCandidates(pc)));
};

const acceptOfferSdp = (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, remoteSdp: string, cbs: ChannelCallbacks) => {
  pc.ondatachannel = ({ channel }) => wireChannel(channel, peerId, name, emit, cbs);
  return asyncTryCatch(() => pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp }))
    .andThen(() => asyncTryCatch(() => pc.createAnswer()))
    .andThen(answer => asyncTryCatch(() => pc.setLocalDescription(answer)))
    .andThen(() => asyncResult<string | undefined, Error>(gatherIceCandidates(pc)));
};

const negotiateOffer = (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, cbs: ChannelCallbacks) =>
  createOfferSdp(pc, peerId, name, emit, cbs)
    .onSuccess(sdp => {
      if (sdp) emit({ type: 'OFFER_CREATED', peerId, sdp });
      else emit({ type: 'ERROR', message: 'ICE gathering timed out' });
    })
    .onFailure(err => emit({ type: 'ERROR', message: err.message }));

const negotiateAnswer = (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, remoteSdp: string, cbs: ChannelCallbacks) =>
  acceptOfferSdp(pc, peerId, name, emit, remoteSdp, cbs)
    .onSuccess(sdp => { if (sdp) emit({ type: 'ANSWER_CREATED', peerId, sdp }); })
    .onFailure(err => emit({ type: 'ERROR', message: err.message }));

const negotiateServerOffer = (pc: RTCPeerConnection, localPeerId: string, signalingPeerId: string, name: string, emit: (event: PeerEvent) => void, cbs: ChannelCallbacks) =>
  createOfferSdp(pc, localPeerId, name, emit, cbs)
    .onSuccess(sdp => {
      if (sdp) emit({ type: 'SERVER_OFFER_CREATED', signalingPeerId, localPeerId, sdp });
      else emit({ type: 'ERROR', message: 'ICE gathering timed out' });
    })
    .onFailure(err => emit({ type: 'ERROR', message: err.message }));

const negotiateServerAnswer = (pc: RTCPeerConnection, localPeerId: string, signalingPeerId: string, name: string, emit: (event: PeerEvent) => void, remoteSdp: string, cbs: ChannelCallbacks) =>
  acceptOfferSdp(pc, localPeerId, name, emit, remoteSdp, cbs)
    .onSuccess(sdp => {
      if (sdp) emit({ type: 'SERVER_ANSWER_CREATED', signalingPeerId, sdp });
      else emit({ type: 'ERROR', message: 'ICE gathering timed out' });
    })
    .onFailure(err => emit({ type: 'ERROR', message: err.message }));

const negotiateIntroOffer = (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, cbs: ChannelCallbacks, relayChannel: RTCDataChannel, introId: string) =>
  createOfferSdp(pc, peerId, name, emit, cbs)
    .onSuccess(sdp => {
      if (sdp) relayChannel.send(JSON.stringify({ type: 'RELAY_SDP', introId, peerId, sdp }));
      else emit({ type: 'ERROR', message: 'ICE gathering timed out' });
    })
    .onFailure(err => emit({ type: 'ERROR', message: err.message }));

const negotiateIntroAnswer = (pc: RTCPeerConnection, peerId: string, name: string, emit: (event: PeerEvent) => void, remoteSdp: string, cbs: ChannelCallbacks, relayChannel: RTCDataChannel, introId: string) =>
  acceptOfferSdp(pc, peerId, name, emit, remoteSdp, cbs)
    .onSuccess(sdp => {
      if (sdp) relayChannel.send(JSON.stringify({ type: 'RELAY_SDP_ANSWER', introId, sdp }));
      else emit({ type: 'ERROR', message: 'ICE gathering timed out' });
    })
    .onFailure(err => emit({ type: 'ERROR', message: err.message }));

const MAX_ICE_RESTART_ATTEMPTS = 3;

const createIceRestartOffer = (pc: RTCPeerConnection, signalingPeerId: string, emit: (event: PeerEvent) => void) => {
  pc.restartIce();
  return asyncTryCatch(() => pc.createOffer({iceRestart: true}))
    .andThen(offer => asyncTryCatch(() => pc.setLocalDescription(offer)))
    .andThen(() => asyncResult<string | undefined, Error>(gatherIceCandidates(pc)))
    .onSuccess(sdp => { if (sdp) emit({type: 'ICE_RESTART_OFFER_CREATED', signalingPeerId, sdp}); });
};

const acceptIceRestartOffer = (pc: RTCPeerConnection, signalingPeerId: string, remoteSdp: string, emit: (event: PeerEvent) => void) =>
  asyncTryCatch(() => pc.setRemoteDescription({type: 'offer', sdp: remoteSdp}))
    .andThen(() => asyncTryCatch(() => pc.createAnswer()))
    .andThen(answer => asyncTryCatch(() => pc.setLocalDescription(answer)))
    .andThen(() => asyncResult<string | undefined, Error>(gatherIceCandidates(pc)))
    .onSuccess(sdp => { if (sdp) emit({type: 'ICE_RESTART_ANSWER_CREATED', signalingPeerId, sdp}); });

export const createPeerHandler = (deps: Deps): Handler => {
  const connections = new Map<string, RTCPeerConnection>();
  const dataChannels = new Map<string, RTCDataChannel>();

  type PendingCoinFlip = {opponentHash: string; myValue: number; myHash: string; iInitiated: boolean; revealSent: boolean}
  const pendingCoinFlips = new Map<string, PendingCoinFlip>();

  type PendingIntro = {
    peerId1: string
    peerId2: string
    accepted: Set<string>
    relaySdpPeerId?: string
    timer: ReturnType<typeof setTimeout>
  }
  const pendingIntros = new Map<string, PendingIntro>();

  const cleanupIntro = (introId: string, type: 'INTRODUCTION_DECLINED' | 'INTRODUCTION_EXPIRED') => {
    const introPeerId = selectIntroConnections(deps.getState())[introId];
    if (introPeerId) {
      deps.dispatch(introConnectionCleared(introId));
      const pc = connections.get(introPeerId);
      connections.delete(introPeerId);
      pc?.close();
    }
    deps.emit({ type, introId });
  };

  const wireIceRestart = (pc: RTCPeerConnection, peerId: string) => {
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'disconnected' || iceState === 'failed') {
        deps.emit({type: 'PEER_CONNECTION_UNSTABLE', peerId});
        if (selectOffererPeerIds(deps.getState()).includes(peerId)) {
          const signalingPeerId = selectPeerToSignaling(deps.getState())[peerId];
          if (!signalingPeerId) return;
          const attempts = (selectIceRestartAttempts(deps.getState())[peerId] ?? 0) + 1;
          if (attempts > MAX_ICE_RESTART_ATTEMPTS) {
            deps.emit({type: 'PEER_DISCONNECTED', peerId});
          } else {
            deps.dispatch(iceRestartAttempted(peerId));
            createIceRestartOffer(pc, signalingPeerId, deps.emit);
          }
        }
      } else if (iceState === 'connected' || iceState === 'completed') {
        if (selectPeerConnectionHealth(deps.getState())[peerId] === 'unstable') {
          deps.emit({type: 'PEER_CONNECTION_RESTORED', peerId});
        }
      }
    };
  };

  const cbs: ChannelCallbacks = {
    onOpen: (peerId, channel) => {
      dataChannels.set(peerId, channel);
      const introEntry = Object.entries(selectIntroConnections(deps.getState())).find(([, pid]) => pid === peerId);
      if (introEntry) deps.dispatch(introConnectionCleared(introEntry[0]));
    },
    onClose: (peerId) => {
      const wasConnected = dataChannels.has(peerId);
      if (!wasConnected) {
        const pc = connections.get(peerId);
        if (pc) { connections.delete(peerId); pc.close(); }
        return;
      }
      deps.emit({ type: 'PEER_DISCONNECTED', peerId });
      for (const [introId, intro] of [...pendingIntros]) {
        if (intro.peerId1 === peerId || intro.peerId2 === peerId) {
          clearTimeout(intro.timer);
          pendingIntros.delete(introId);
          const otherPeerId = peerId === intro.peerId1 ? intro.peerId2 : intro.peerId1;
          dataChannels.get(otherPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_DECLINED', introId }));
        }
      }
    },
    onMessage: (peerId, parsed) => {
      maybe(introduceDecoder.decode(parsed))
        .map(msg => {
          deps.emit({ type: 'PEER_NAMED', peerId, name: msg.name });
        })
        .or(() => maybe(trustDecoder.decode(parsed))
          .map(msg => {
            deps.emit({ type: 'PEER_TRUST_UPDATED', peerId, trusts: msg.granted });
          }))
        .or(() => maybe(introductionResponseDecoder.decode(parsed))
          .map(msg => {
            const intro = pendingIntros.get(msg.introId);
            if (!intro) return;
            if (!msg.accepted) {
              clearTimeout(intro.timer);
              pendingIntros.delete(msg.introId);
              const otherPeerId = peerId === intro.peerId1 ? intro.peerId2 : intro.peerId1;
              dataChannels.get(otherPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_DECLINED', introId: msg.introId }));
              return;
            }
            intro.accepted.add(peerId);
            if (intro.accepted.size === 2) {
              clearTimeout(intro.timer);
              intro.timer = setTimeout(() => {
                const staleIntro = pendingIntros.get(msg.introId);
                if (!staleIntro) return;
                pendingIntros.delete(msg.introId);
                dataChannels.get(staleIntro.peerId1)?.send(JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId: msg.introId }));
                dataChannels.get(staleIntro.peerId2)?.send(JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId: msg.introId }));
              }, 60000);
              dataChannels.get(intro.peerId1)?.send(JSON.stringify({ type: 'CREATE_OFFER_FOR', introId: msg.introId }));
            }
          }))
        .or(() => maybe(relaySdpDecoder.decode(parsed))
          .map(msg => {
            const intro = pendingIntros.get(msg.introId);
            if (!intro) return;
            intro.relaySdpPeerId = msg.peerId;
            const otherPeerId = peerId === intro.peerId1 ? intro.peerId2 : intro.peerId1;
            dataChannels.get(otherPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_SDP', introId: msg.introId, sdp: msg.sdp }));
          }))
        .or(() => maybe(relaySdpAnswerDecoder.decode(parsed))
          .map(msg => {
            const intro = pendingIntros.get(msg.introId);
            if (!intro) return;
            clearTimeout(intro.timer);
            dataChannels.get(intro.peerId1)?.send(JSON.stringify({ type: 'INTRODUCTION_SDP_ANSWER', introId: msg.introId, peerId: intro.relaySdpPeerId, sdp: msg.sdp }));
            pendingIntros.delete(msg.introId);
          }))
        .or(() => maybe(introductionDecoder.decode(parsed))
          .map(msg => {
            deps.dispatch(introChannelRegistered(msg.introId, peerId));
            deps.emit({ type: 'INTRODUCTION_RECEIVED', introId: msg.introId, from: msg.from, peer: msg.peer });
          }))
        .or(() => maybe(createOfferForDecoder.decode(parsed))
          .map(msg => {
            const relayChannel = dataChannels.get(peerId);
            if (!relayChannel) return;
            const newPeerId = generatePeerId();
            const pc = deps.createPeerConnection();
            connections.set(newPeerId, pc);
            deps.dispatch(introConnectionRegistered(msg.introId, newPeerId));
            negotiateIntroOffer(pc, newPeerId, deps.name, deps.emit, cbs, relayChannel, msg.introId);
          }))
        .or(() => maybe(introductionSdpAnswerDecoder.decode(parsed))
          .map(msg => {
            const pc = connections.get(msg.peerId);
            if (pc) asyncTryCatch(() => pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp }));
          }))
        .or(() => maybe(introductionSdpDecoder.decode(parsed))
          .map(msg => {
            const relayChannel = dataChannels.get(peerId);
            if (!relayChannel) return;
            const newPeerId = generatePeerId();
            const pc = deps.createPeerConnection();
            connections.set(newPeerId, pc);
            deps.dispatch(introConnectionRegistered(msg.introId, newPeerId));
            negotiateIntroAnswer(pc, newPeerId, deps.name, deps.emit, msg.sdp, cbs, relayChannel, msg.introId);
          }))
        .or(() => maybe(introductionDeclinedDecoder.decode(parsed))
          .map(msg => cleanupIntro(msg.introId, 'INTRODUCTION_DECLINED')))
        .or(() => maybe(introductionExpiredDecoder.decode(parsed))
          .map(msg => cleanupIntro(msg.introId, 'INTRODUCTION_EXPIRED')))
        .or(() => maybe(chatDecoder.decode(parsed))
          .map(msg => deps.emit({ type: 'MESSAGE_RECEIVED', peerId, text: msg.text })))
        .or(() => maybe(gameChallengeDecoder.decode(parsed))
          .map(() => {
            const game = selectP2pGame(deps.getState());
            if (game) {
              dataChannels.get(peerId)?.send(JSON.stringify({type: 'GAME_DECLINE', reason: 'busy'}));
            } else {
              deps.dispatch(challengeReceived(peerId));
            }
          }))
        .or(() => maybe(gameAcceptDecoder.decode(parsed))
          .map(() => deps.dispatch(acceptChallenge())))
        .or(() => maybe(gameDeclineDecoder.decode(parsed))
          .map(() => deps.dispatch(declineChallenge())))
        .or(() => maybe(gameCancelDecoder.decode(parsed))
          .map(() => deps.dispatch(cancelChallenge())))
        .or(() => maybe(boardReadyDecoder.decode(parsed))
          .map(msg => deps.dispatch(opponentBoardReady(msg.boardHash))))
        .or(() => maybe(coinFlipCommitDecoder.decode(parsed))
          .map(msg => {
            const existing = pendingCoinFlips.get(peerId);
            if (existing?.iInitiated) {
              // Simultaneous: both sent COMMIT. Use hash comparison to assign roles deterministically.
              const iInitiated = existing.myHash < msg.hash;
              pendingCoinFlips.set(peerId, {...existing, opponentHash: msg.hash, iInitiated, revealSent: true});
              dataChannels.get(peerId)?.send(JSON.stringify({type: 'COIN_FLIP_REVEAL', value: existing.myValue}));
            } else {
              const myValue = Math.floor(Math.random() * 0xFFFFFFFF);
              const myHash = myValue.toString(16);
              pendingCoinFlips.set(peerId, {opponentHash: msg.hash, myValue, myHash, iInitiated: false, revealSent: true});
              dataChannels.get(peerId)?.send(JSON.stringify({type: 'COIN_FLIP_REVEAL', value: myValue}));
            }
          }))
        .or(() => maybe(coinFlipRevealDecoder.decode(parsed))
          .map(msg => {
            const flip = pendingCoinFlips.get(peerId);
            if (!flip) return;
            pendingCoinFlips.delete(peerId);
            if (flip.iInitiated && !flip.revealSent) {
              dataChannels.get(peerId)?.send(JSON.stringify({type: 'COIN_FLIP_REVEAL', value: flip.myValue}));
            }
            const merged = flip.myValue ^ msg.value;
            // Initiator and non-initiator evaluate oppositely to guarantee different turn assignments
            const iGoFirst = flip.iInitiated ? (merged % 2) === 0 : (merged % 2) !== 0;
            deps.dispatch(turnOrderDecided(iGoFirst));
          }))
        .or(() => maybe(p2pFireDecoder.decode(parsed))
          .map(msg => {
            const game = selectP2pGame(deps.getState());
            const board = selectBoard(deps.getState());
            if (!game || !board) return;
            if (game.phase !== 'their-turn') return;
            if (game.opponentShots.some(s => s.cell.row === msg.row && s.cell.col === msg.col)) return;
            const shot = resolveP2pShot(board, game.opponentShots, {row: msg.row, col: msg.col});
            deps.dispatch(opponentFired(shot));
            dataChannels.get(peerId)?.send(JSON.stringify({
              type: 'FIRE_RESULT', row: msg.row, col: msg.col, result: shot.result,
              ...(shot.ship ? {ship: shot.ship} : {}),
            }));
            const updatedOpponentShots = [...game.opponentShots, shot];
            if (isFleetSunk(updatedOpponentShots)) {
              deps.dispatch(p2pGameOver('opponent'));
            }
          }))
        .or(() => maybe(p2pFireResultDecoder.decode(parsed))
          .map(msg => {
            const shot: Shot = {
              cell: {row: msg.row, col: msg.col},
              result: msg.result,
              ...(msg.ship ? {ship: msg.ship} : {}),
            };
            deps.dispatch(p2pFireResult(shot));
            const game = selectP2pGame(deps.getState());
            if (game && isFleetSunk(game.myShots)) {
              deps.dispatch(p2pGameOver('me'));
            }
          }))
        .or(() => maybe(gameForfeitDecoder.decode(parsed))
          .map(() => deps.dispatch(opponentForfeited())))
        .or(() => maybe(gameStateSyncDecoder.decode(parsed))
          .map(msg => {
            const game = selectP2pGame(deps.getState());
            if (!game) return;
            const myShots = msg.myShots as Shot[];
            const opponentShots = msg.opponentShots as Shot[];
            const shotsMatch =
              myShots.length === game.opponentShots.length &&
              opponentShots.length === game.myShots.length;
            if (shotsMatch) {
              deps.dispatch(p2pStateSync(game.opponentId, game.myShots, game.opponentShots, game.phase));
            } else {
              deps.dispatch(p2pStateMismatch());
            }
          }));
    },
  };

  const handleCommand = (command: PeerCommand) => {
    switch (command.type) {
      case 'CREATE_OFFER': {
        const peerId = generatePeerId();
        const pc = deps.createPeerConnection();
        connections.set(peerId, pc);
        negotiateOffer(pc, peerId, deps.name, deps.emit, cbs);
        break;
      }
      case 'ACCEPT_OFFER': {
        const peerId = generatePeerId();
        const pc = deps.createPeerConnection();
        connections.set(peerId, pc);
        negotiateAnswer(pc, peerId, deps.name, deps.emit, command.sdp, cbs)
          .onSuccess(sdp => { if (!sdp) deps.dispatch(offerFailed()); })
          .onFailure(() => deps.dispatch(offerFailed()));
        break;
      }
      case 'ACCEPT_ANSWER': {
        const pc = connections.get(command.peerId);
        if (pc) asyncTryCatch(() => pc.setRemoteDescription({ type: 'answer', sdp: command.sdp }));
        break;
      }
      case 'SEND_MESSAGE': {
        dataChannels.get(command.peerId)?.send(JSON.stringify({ type: 'CHAT', text: command.text }));
        break;
      }
      case 'DISCONNECT': {
        connections.get(command.peerId)?.close();
        break;
      }
      case 'GRANT_TRUST': {
        dataChannels.get(command.peerId)?.send(JSON.stringify({ type: 'TRUST', granted: true }));
        break;
      }
      case 'REVOKE_TRUST': {
        dataChannels.get(command.peerId)?.send(JSON.stringify({ type: 'TRUST', granted: false }));
        break;
      }
      case 'INTRODUCE_PEERS': {
        const ch1 = dataChannels.get(command.peerId1);
        const ch2 = dataChannels.get(command.peerId2);
        const peers = selectPeers(deps.getState());
        const name1 = peers.find(p => p.id === command.peerId1)?.name;
        const name2 = peers.find(p => p.id === command.peerId2)?.name;
        if (!ch1 || !ch2 || !name1 || !name2) break;
        const introId = generatePeerId();
        const timer = setTimeout(() => {
          const intro = pendingIntros.get(introId);
          if (!intro) return;
          pendingIntros.delete(introId);
          dataChannels.get(intro.peerId1)?.send(JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId }));
          dataChannels.get(intro.peerId2)?.send(JSON.stringify({ type: 'INTRODUCTION_EXPIRED', introId }));
        }, 60000);
        pendingIntros.set(introId, { peerId1: command.peerId1, peerId2: command.peerId2, accepted: new Set(), timer });
        ch1.send(JSON.stringify({ type: 'INTRODUCTION', introId, from: deps.name, peer: name2 }));
        ch2.send(JSON.stringify({ type: 'INTRODUCTION', introId, from: deps.name, peer: name1 }));
        break;
      }
      case 'ACCEPT_INTRODUCTION': {
        const introducerPeerId = command.relayPeerId ?? selectIntroChannels(deps.getState())[command.introId];
        if (introducerPeerId) {
          dataChannels.get(introducerPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId: command.introId, accepted: true }));
        }
        break;
      }
      case 'DECLINE_INTRODUCTION': {
        const introducerPeerId = command.relayPeerId ?? selectIntroChannels(deps.getState())[command.introId];
        if (introducerPeerId) {
          dataChannels.get(introducerPeerId)?.send(JSON.stringify({ type: 'INTRODUCTION_RESPONSE', introId: command.introId, accepted: false }));
        }
        break;
      }
      case 'CONNECT_VIA_SERVER': {
        const localPeerId = generatePeerId();
        const pc = deps.createPeerConnection();
        connections.set(localPeerId, pc);
        deps.dispatch(signalingPeerRegistered(localPeerId, command.signalingPeerId, true));
        wireIceRestart(pc, localPeerId);
        negotiateServerOffer(pc, localPeerId, command.signalingPeerId, deps.name, deps.emit, cbs);
        break;
      }
      case 'SERVER_OFFER_RECEIVED': {
        const localPeerId = generatePeerId();
        const pc = deps.createPeerConnection();
        connections.set(localPeerId, pc);
        deps.dispatch(signalingPeerRegistered(localPeerId, command.signalingPeerId, false));
        wireIceRestart(pc, localPeerId);
        negotiateServerAnswer(pc, localPeerId, command.signalingPeerId, deps.name, deps.emit, command.sdp, cbs);
        break;
      }
      case 'SERVER_ANSWER_RECEIVED': {
        const localPeerId = selectSignalingToPeer(deps.getState())[command.signalingPeerId];
        if (!localPeerId) break;
        const pc = connections.get(localPeerId);
        if (pc) asyncTryCatch(() => pc.setRemoteDescription({ type: 'answer', sdp: command.sdp }));
        break;
      }
      case 'ICE_RESTART_RECEIVED': {
        const localPeerId = selectSignalingToPeer(deps.getState())[command.signalingPeerId];
        if (!localPeerId) break;
        const pc = connections.get(localPeerId);
        if (pc) acceptIceRestartOffer(pc, command.signalingPeerId, command.sdp, deps.emit);
        break;
      }
      case 'ICE_RESTART_ANSWER_RECEIVED': {
        const localPeerId = selectSignalingToPeer(deps.getState())[command.signalingPeerId];
        if (!localPeerId) break;
        const pc = connections.get(localPeerId);
        if (pc) asyncTryCatch(() => pc.setRemoteDescription({type: 'answer', sdp: command.sdp}));
        break;
      }
      case 'SEND_TO_PEER': {
        dataChannels.get(command.peerId)?.send(JSON.stringify(command.message));
        break;
      }
      case 'START_COIN_FLIP': {
        const myValue = Math.floor(Math.random() * 0xFFFFFFFF);
        const myHash = myValue.toString(16);
        pendingCoinFlips.set(command.peerId, {opponentHash: '', myValue, myHash, iInitiated: true, revealSent: false});
        dataChannels.get(command.peerId)?.send(JSON.stringify({type: 'COIN_FLIP_COMMIT', hash: myHash}));
        break;
      }
    }
  };

  const cleanup = (peerId: string) => {
    dataChannels.delete(peerId);
    const pc = connections.get(peerId);
    if (pc) { connections.delete(peerId); pc.close(); }
  };

  return { handleCommand, cleanup };
};
