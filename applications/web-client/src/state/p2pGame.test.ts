import {createGameStore} from '../game/gameStore';
import {
  challengePeer, challengeReceived, acceptChallenge, declineChallenge, cancelChallenge,
  p2pBoardReady, opponentBoardReady, turnOrderDecided,
  p2pFireResult, opponentFired,
  p2pGameOver, forfeitGame, opponentForfeited,
  p2pStateMismatch, peerDisconnected, clearP2pGame, opponentBoardRevealed,
} from '../game/gameActions';
import {selectP2pGame} from '../game/gameSelectors';
import type {Shot} from '../game/game';

const makeStore = () => createGameStore();

describe('P2P game', () => {
  describe('challenge flow', () => {
    it('CHALLENGE_PEER sets phase to challenged', () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      expect(selectP2pGame(store.getState())).toMatchObject({phase: 'challenged', opponentId: 'peer-bob'});
    });

    it('CHALLENGE_RECEIVED sets phase to challenge-received', () => {
      const store = makeStore();
      store.dispatch(challengeReceived('peer-alice'));
      expect(selectP2pGame(store.getState())).toMatchObject({phase: 'challenge-received', opponentId: 'peer-alice'});
    });

    it('ACCEPT_CHALLENGE transitions to placing', () => {
      const store = makeStore();
      store.dispatch(challengeReceived('peer-alice'));
      store.dispatch(acceptChallenge());
      expect(selectP2pGame(store.getState())?.phase).toBe('placing');
    });

    it('challenger transitions to placing on ACCEPT_CHALLENGE', () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      expect(selectP2pGame(store.getState())?.phase).toBe('placing');
    });

    it('DECLINE_CHALLENGE clears p2pGame', () => {
      const store = makeStore();
      store.dispatch(challengeReceived('peer-alice'));
      store.dispatch(declineChallenge());
      expect(selectP2pGame(store.getState())).toBeNull();
    });

    it('CANCEL_CHALLENGE clears p2pGame', () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(cancelChallenge());
      expect(selectP2pGame(store.getState())).toBeNull();
    });
  });

  describe('board ready', () => {
    const makePlacingStore = () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      return store;
    };

    it('P2P_BOARD_READY marks my board ready with hash', () => {
      const store = makePlacingStore();
      store.dispatch(p2pBoardReady('abc123'));
      expect(selectP2pGame(store.getState())).toMatchObject({myBoardReady: true, myBoardHash: 'abc123'});
    });

    it('OPPONENT_BOARD_READY marks opponent board ready with hash', () => {
      const store = makePlacingStore();
      store.dispatch(opponentBoardReady('def456'));
      expect(selectP2pGame(store.getState())).toMatchObject({opponentBoardReady: true, opponentBoardHash: 'def456'});
    });

    it('phase stays placing when only my board is ready', () => {
      const store = makePlacingStore();
      store.dispatch(p2pBoardReady('abc123'));
      expect(selectP2pGame(store.getState())?.phase).toBe('placing');
    });

    it('phase transitions to selecting-turn when both boards are ready', () => {
      const store = makePlacingStore();
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      expect(selectP2pGame(store.getState())?.phase).toBe('selecting-turn');
    });

    it('also transitions when opponent ready arrives first', () => {
      const store = makePlacingStore();
      store.dispatch(opponentBoardReady('def456'));
      store.dispatch(p2pBoardReady('abc123'));
      expect(selectP2pGame(store.getState())?.phase).toBe('selecting-turn');
    });
  });

  describe('turn selection', () => {
    const makeSelectingStore = () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      return store;
    };

    it('TURN_ORDER_DECIDED with iGoFirst=true sets my-turn', () => {
      const store = makeSelectingStore();
      store.dispatch(turnOrderDecided(true));
      expect(selectP2pGame(store.getState())?.phase).toBe('my-turn');
    });

    it('TURN_ORDER_DECIDED with iGoFirst=false sets their-turn', () => {
      const store = makeSelectingStore();
      store.dispatch(turnOrderDecided(false));
      expect(selectP2pGame(store.getState())?.phase).toBe('their-turn');
    });
  });

  describe('gameplay', () => {
    const makeMyTurnStore = () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      store.dispatch(turnOrderDecided(true));
      return store;
    };

    const makeTheirTurnStore = () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      store.dispatch(turnOrderDecided(false));
      return store;
    };

    const shot: Shot = {cell: {row: 1, col: 1}, result: 'miss'};

    it('P2P_FIRE_RESULT adds shot to myShots and transitions to their-turn', () => {
      const store = makeMyTurnStore();
      store.dispatch(p2pFireResult(shot));
      expect(selectP2pGame(store.getState())?.myShots).toEqual([shot]);
      expect(selectP2pGame(store.getState())?.phase).toBe('their-turn');
    });

    it('OPPONENT_FIRED adds shot to opponentShots and transitions to my-turn', () => {
      const store = makeTheirTurnStore();
      const incomingShot: Shot = {cell: {row: 2, col: 3}, result: 'hit'};
      store.dispatch(opponentFired(incomingShot));
      expect(selectP2pGame(store.getState())?.opponentShots).toEqual([incomingShot]);
      expect(selectP2pGame(store.getState())?.phase).toBe('my-turn');
    });
  });

  describe('game over', () => {
    const makeInProgressStore = () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      store.dispatch(turnOrderDecided(true));
      return store;
    };

    it('P2P_GAME_OVER sets phase to game-over with winner', () => {
      const store = makeInProgressStore();
      store.dispatch(p2pGameOver('me'));
      expect(selectP2pGame(store.getState())).toMatchObject({phase: 'game-over', winner: 'me'});
    });

    it('FORFEIT_GAME sets opponent as winner', () => {
      const store = makeInProgressStore();
      store.dispatch(forfeitGame());
      expect(selectP2pGame(store.getState())).toMatchObject({phase: 'game-over', winner: 'opponent'});
    });

    it('OPPONENT_FORFEITED sets me as winner', () => {
      const store = makeInProgressStore();
      store.dispatch(opponentForfeited());
      expect(selectP2pGame(store.getState())).toMatchObject({phase: 'game-over', winner: 'me'});
    });
  });

  describe('clearing game', () => {
    it('CLEAR_P2P_GAME resets p2pGame to null from game-over', () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      store.dispatch(turnOrderDecided(true));
      store.dispatch(p2pGameOver('me'));
      store.dispatch(clearP2pGame());
      expect(selectP2pGame(store.getState())).toBeNull();
    });

    it('CLEAR_P2P_GAME resets p2pGame to null from disconnected', () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      store.dispatch(turnOrderDecided(true));
      store.dispatch(peerDisconnected('peer-bob'));
      store.dispatch(clearP2pGame());
      expect(selectP2pGame(store.getState())).toBeNull();
    });
  });

  describe('disconnect', () => {
    const makeInProgressStore = () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-bob'));
      store.dispatch(acceptChallenge());
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      store.dispatch(turnOrderDecided(true));
      return store;
    };

    it('PEER_DISCONNECTED transitions to disconnected when opponent disconnects', () => {
      const store = makeInProgressStore();
      store.dispatch(peerDisconnected('peer-bob'));
      expect(selectP2pGame(store.getState())?.phase).toBe('disconnected');
    });

    it('PEER_DISCONNECTED does not affect game when unrelated peer disconnects', () => {
      const store = makeInProgressStore();
      store.dispatch(peerDisconnected('other-peer'));
      expect(selectP2pGame(store.getState())?.phase).toBe('my-turn');
    });

    it('P2P_STATE_MISMATCH sets phase to state-mismatch', () => {
      const store = makeInProgressStore();
      store.dispatch(p2pStateMismatch());
      expect(selectP2pGame(store.getState())?.phase).toBe('state-mismatch');
    });

    it('OPPONENT_BOARD_REVEALED while game is in progress is ignored', () => {
      const store = makeInProgressStore();
      store.dispatch(opponentBoardRevealed({placed: []}, true));
      expect(selectP2pGame(store.getState())?.opponentBoard).toBeNull();
    });
  });
});
