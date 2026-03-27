import * as Decoder from 'schemawax';
import {maybe} from '../lib/maybe';
import {tryCatch} from '../lib/result';
import type {ConnectionEvent} from '../connections/connectionPort';
import type {GameAction, Shot, P2pGamePhase, P2pGame} from './game';
import type {Board} from './board';
import {occupiedCells, isCellOccupied} from './board';
import {hashBoard} from './hashBoard';
import {
  challengeReceived, acceptChallenge, declineChallenge, cancelChallenge,
  opponentBoardReady, turnOrderDecided, p2pFireResult, opponentFired,
  p2pGameOver, opponentForfeited, p2pStateMismatch, p2pStateSync, opponentBoardRevealed,
  peerConnected, peerNamed, peerDisconnected,
  loadBoard, loadGame, boardSaved, boardLoaded, boardNotFound,
  gameStarted, fireResult, gameStateReceived, gameNotFound, p2pGameLoaded,
} from './gameActions';

// Server message decoders
const registeredServerDecoder = Decoder.object({required: {type: Decoder.literal('REGISTERED')}});
const boardSavedServerDecoder = Decoder.object({required: {type: Decoder.literal('BOARD_SAVED')}});
const boardNotFoundServerDecoder = Decoder.object({required: {type: Decoder.literal('BOARD_NOT_FOUND')}});
const gameNotFoundServerDecoder = Decoder.object({required: {type: Decoder.literal('GAME_NOT_FOUND')}});
const p2pGameNotFoundServerDecoder = Decoder.object({required: {type: Decoder.literal('P2P_GAME_NOT_FOUND')}});
const p2pGameLoadedServerDecoder = Decoder.object({required: {type: Decoder.literal('P2P_GAME_LOADED'), gameState: Decoder.string}});

const aiGamePhaseDecoder = Decoder.oneOf(
  Decoder.literal('player-turn'),
  Decoder.literal('computer-turn'),
  Decoder.literal('player-won'),
  Decoder.literal('computer-won'),
);

const p2pPhaseDecoder = Decoder.oneOf(
  Decoder.literal('challenged'),
  Decoder.literal('challenge-received'),
  Decoder.literal('placing'),
  Decoder.literal('selecting-turn'),
  Decoder.literal('my-turn'),
  Decoder.literal('their-turn'),
  Decoder.literal('game-over'),
  Decoder.literal('disconnected'),
  Decoder.literal('state-mismatch'),
);

const gameChallengeDecoder = Decoder.object({required: {type: Decoder.literal('GAME_CHALLENGE')}});
const gameAcceptDecoder = Decoder.object({required: {type: Decoder.literal('GAME_ACCEPT')}});
const gameDeclineDecoder = Decoder.object({required: {type: Decoder.literal('GAME_DECLINE')}});
const gameCancelDecoder = Decoder.object({required: {type: Decoder.literal('GAME_CANCEL')}});
const boardReadyDecoder = Decoder.object({required: {type: Decoder.literal('BOARD_READY'), boardHash: Decoder.string}});
const gameFirstTurnDecoder = Decoder.object({required: {type: Decoder.literal('GAME_FIRST_TURN')}});
const p2pFireDecoder = Decoder.object({required: {type: Decoder.literal('FIRE'), row: Decoder.number, col: Decoder.number}});
const p2pCellDecoder = Decoder.object({required: {row: Decoder.number, col: Decoder.number}});
const p2pShipInfoDecoder = Decoder.object({required: {name: Decoder.string, size: Decoder.number}});
const shotResultDecoder = Decoder.oneOf(Decoder.literal('hit'), Decoder.literal('miss'), Decoder.literal('sunk'));
const p2pFireResultDecoder = Decoder.object({
  required: {type: Decoder.literal('FIRE_RESULT'), row: Decoder.number, col: Decoder.number, result: shotResultDecoder},
  optional: {ship: p2pShipInfoDecoder},
});
const gameForfeitDecoder = Decoder.object({required: {type: Decoder.literal('GAME_FORFEIT')}});
const p2pOrientationDecoder = Decoder.oneOf(Decoder.literal('horizontal'), Decoder.literal('vertical'));
const shipNameDecoder = Decoder.oneOf(
  Decoder.literal('Carrier'),
  Decoder.literal('Battleship'),
  Decoder.literal('Cruiser'),
  Decoder.literal('Submarine'),
  Decoder.literal('Destroyer'),
);
const p2pPlacedShipDecoder = Decoder.object({
  required: {
    ship: Decoder.object({required: {name: shipNameDecoder, size: Decoder.number}}),
    position: Decoder.object({required: {row: Decoder.number, col: Decoder.number}}),
    orientation: p2pOrientationDecoder,
  },
});
const gameOverDecoder = Decoder.object({
  required: {
    type: Decoder.literal('GAME_OVER'),
    board: Decoder.object({required: {placed: Decoder.array(p2pPlacedShipDecoder)}}),
  },
});
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

// Server message decoders (dependent on peer decoders above)
const boardDecoder = Decoder.object({required: {placed: Decoder.array(p2pPlacedShipDecoder)}});
const boardLoadedServerDecoder = Decoder.object({required: {type: Decoder.literal('BOARD_LOADED'), board: boardDecoder}});

const aiGameStateDecoder = Decoder.object({
  required: {
    playerShots: Decoder.array(p2pShotDecoder),
    aiShots: Decoder.array(p2pShotDecoder),
    phase: aiGamePhaseDecoder,
    announcement: Decoder.string,
  },
});
const gameStartedServerDecoder = Decoder.object({required: {type: Decoder.literal('GAME_STARTED'), gameState: aiGameStateDecoder}});
const gameStateServerDecoder = Decoder.object({required: {type: Decoder.literal('GAME_STATE'), gameState: aiGameStateDecoder}});
const fireResultServerDecoder = Decoder.object({
  required: {type: Decoder.literal('FIRE_RESULT'), playerShot: p2pShotDecoder, phase: aiGamePhaseDecoder},
  optional: {aiShot: p2pShotDecoder},
});

const serverP2pGameStateDecoder = Decoder.object({
  required: {
    opponentId: Decoder.string,
    phase: p2pPhaseDecoder,
    myBoardHash: Decoder.string,
    myShots: Decoder.array(p2pShotDecoder),
    opponentShots: Decoder.array(p2pShotDecoder),
    myBoardReady: Decoder.boolean,
    opponentBoardReady: Decoder.boolean,
  },
  optional: {
    opponentBoardHash: Decoder.string,
  },
});

const TOTAL_SHIPS = 5;
const isFleetSunk = (shots: Shot[]): boolean =>
  new Set(shots.filter(s => s.result === 'sunk' && s.ship).map(s => s.ship!.name)).size >= TOTAL_SHIPS;

const resolveP2pShot = (board: Board, prevShots: Shot[], cell: {row: number; col: number}): Shot => {
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

type P2pGameView = {
  opponentId: string
  phase: P2pGamePhase
  myShots: Shot[]
  opponentShots: Shot[]
  opponentBoardHash: string | null
  winner: 'me' | 'opponent' | null
}

type GameMessageDeps = {
  dispatch: (action: GameAction) => void
  getP2pGame: () => P2pGameView | null
  getBoard: () => Board | null
  getOffererPeerIds: () => string[]
  sendToPeer: (peerId: string, message: unknown) => void
  translatePeerId?: (signalingId: string) => string | undefined
}

export const createGameMessageHandler = (deps: GameMessageDeps) =>
  (event: ConnectionEvent): void => {
    if (event.type === 'PEER_CONNECTED') {
      deps.dispatch(peerConnected(event.peerId, event.isOfferer));
      return;
    }
    if (event.type === 'PEER_NAMED') {
      deps.dispatch(peerNamed(event.peerId, event.name));
      return;
    }
    if (event.type === 'PEER_DISCONNECTED') {
      deps.dispatch(peerDisconnected(event.peerId));
      return;
    }
    if (event.type === 'SERVER_MESSAGE') {
      const data = event.data;
      maybe(registeredServerDecoder.decode(data))
        .map(() => {
          deps.dispatch(loadBoard());
          deps.dispatch(loadGame());
        })
        .or(() => maybe(boardSavedServerDecoder.decode(data))
          .map(() => deps.dispatch(boardSaved())))
        .or(() => maybe(boardLoadedServerDecoder.decode(data))
          .map(msg => deps.dispatch(boardLoaded(msg.board))))
        .or(() => maybe(boardNotFoundServerDecoder.decode(data))
          .map(() => deps.dispatch(boardNotFound())))
        .or(() => maybe(gameStartedServerDecoder.decode(data))
          .map(msg => deps.dispatch(gameStarted(msg.gameState))))
        .or(() => maybe(fireResultServerDecoder.decode(data))
          .map(msg => deps.dispatch(fireResult(msg.playerShot, msg.aiShot ?? null, msg.phase))))
        .or(() => maybe(gameStateServerDecoder.decode(data))
          .map(msg => deps.dispatch(gameStateReceived(msg.gameState))))
        .or(() => maybe(gameNotFoundServerDecoder.decode(data))
          .map(() => deps.dispatch(gameNotFound())))
        .or(() => maybe(p2pGameNotFoundServerDecoder.decode(data))
          .map(() => {}))
        .or(() => maybe(p2pGameLoadedServerDecoder.decode(data))
          .map(msg => {
            tryCatch(() => JSON.parse(msg.gameState), () => null)
              .onSuccess(gs => {
                const decoded = serverP2pGameStateDecoder.decode(gs);
                if (!decoded) return;
                const localOpponentId = deps.translatePeerId?.(decoded.opponentId);
                const game: P2pGame = {
                  opponentId: localOpponentId ?? decoded.opponentId,
                  phase: decoded.phase,
                  myBoardHash: decoded.myBoardHash,
                  opponentBoardHash: decoded.opponentBoardHash ?? null,
                  myShots: decoded.myShots,
                  opponentShots: decoded.opponentShots,
                  myBoardReady: decoded.myBoardReady,
                  opponentBoardReady: decoded.opponentBoardReady,
                  winner: null,
                  opponentBoard: null,
                  boardVerified: null,
                  announcement: '',
                };
                deps.dispatch(p2pGameLoaded(game));
              });
          }));
      return;
    }
    if (event.type !== 'PEER_MESSAGE') return;

    const {peerId, data: parsed} = event;

    maybe(gameChallengeDecoder.decode(parsed))
      .map(() => {
        const game = deps.getP2pGame();
        if (game) {
          deps.sendToPeer(peerId, {type: 'GAME_DECLINE', reason: 'busy'});
        } else {
          deps.dispatch(challengeReceived(peerId));
        }
      })
      .or(() => maybe(gameAcceptDecoder.decode(parsed))
        .map(() => deps.dispatch(acceptChallenge())))
      .or(() => maybe(gameDeclineDecoder.decode(parsed))
        .map(() => deps.dispatch(declineChallenge())))
      .or(() => maybe(gameCancelDecoder.decode(parsed))
        .map(() => deps.dispatch(cancelChallenge())))
      .or(() => maybe(boardReadyDecoder.decode(parsed))
        .map(msg => deps.dispatch(opponentBoardReady(msg.boardHash))))
      .or(() => maybe(gameFirstTurnDecoder.decode(parsed))
        .map(() => {
          const game = deps.getP2pGame();
          if (!game) return;
          if (game.phase === 'selecting-turn') {
            deps.dispatch(turnOrderDecided(false));
          } else if (game.phase === 'my-turn') {
            // Both claimed first simultaneously — offerer yields to answerer
            if (deps.getOffererPeerIds().includes(peerId)) deps.dispatch(turnOrderDecided(false));
          }
        }))
      .or(() => maybe(p2pFireDecoder.decode(parsed))
        .map(msg => {
          const game = deps.getP2pGame();
          const board = deps.getBoard();
          if (!game || !board) return;
          if (game.phase !== 'their-turn') return;
          if (game.opponentShots.some(s => s.cell.row === msg.row && s.cell.col === msg.col)) return;
          const shot = resolveP2pShot(board, game.opponentShots, {row: msg.row, col: msg.col});
          deps.dispatch(opponentFired(shot));
          deps.sendToPeer(peerId, {
            type: 'FIRE_RESULT', row: msg.row, col: msg.col, result: shot.result,
            ...(shot.ship ? {ship: shot.ship} : {}),
          });
          const updatedOpponentShots = [...game.opponentShots, shot];
          if (isFleetSunk(updatedOpponentShots)) {
            deps.dispatch(p2pGameOver('opponent'));
            deps.sendToPeer(peerId, {type: 'GAME_OVER', board});
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
          const game = deps.getP2pGame();
          if (game && isFleetSunk(game.myShots)) {
            deps.dispatch(p2pGameOver('me'));
          }
        }))
      .or(() => maybe(gameForfeitDecoder.decode(parsed))
        .map(() => deps.dispatch(opponentForfeited())))
      .or(() => maybe(gameOverDecoder.decode(parsed))
        .map(msg => {
          const game = deps.getP2pGame();
          if (!game || game.winner !== 'me') return;
          hashBoard(msg.board)
            .onSuccess(hash => deps.dispatch(opponentBoardRevealed(msg.board, hash === game.opponentBoardHash)))
            .onFailure(() => deps.dispatch(opponentBoardRevealed(msg.board, false)));
        }))
      .or(() => maybe(gameStateSyncDecoder.decode(parsed))
        .map(msg => {
          const game = deps.getP2pGame();
          if (!game) return;
          const myShots = msg.myShots;
          const opponentShots = msg.opponentShots;
          const shotsMatch =
            myShots.length === game.opponentShots.length &&
            opponentShots.length === game.myShots.length;
          if (shotsMatch) {
            deps.dispatch(p2pStateSync(game.opponentId, game.myShots, game.opponentShots, game.phase));
          } else {
            deps.dispatch(p2pStateMismatch());
          }
        }));
  };
