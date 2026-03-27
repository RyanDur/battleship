import {createGameStore} from './gameStore';
import {
  challengePeer, challengeReceived, acceptChallenge, declineChallenge, cancelChallenge,
  p2pBoardReady, opponentBoardReady, turnOrderDecided,
  p2pFireResult, opponentFired,
  p2pGameOver, forfeitGame, opponentForfeited,
  p2pStateMismatch, peerDisconnected, clearP2pGame, opponentBoardRevealed,
  boardLoaded, boardNotFound, saveBoard,
  gameStarted, fireResult, gameStateReceived, gameNotFound,
  peerNamed, peerConnected,
  p2pGameLoaded,
} from './gameActions';
import {
  selectP2pGame, selectBoard, selectBoardLoading, selectAiGameState,
  selectAnnouncement, selectGameView, selectOpponentNames, selectOffererPeerIds,
} from './gameSelectors';
import type {Shot, AiGameState, P2pGame} from './game';
import type {Board} from './board';
import {createConnectionPort} from '../connections/connectionPort';

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

  describe('game loading', () => {
    const loadedGame: P2pGame = {
      opponentId: 'peer-saved',
      phase: 'my-turn',
      myBoardHash: 'hash-a',
      opponentBoardHash: 'hash-b',
      myShots: [{cell: {row: 0, col: 0}, result: 'miss'}],
      opponentShots: [{cell: {row: 1, col: 1}, result: 'hit'}],
      myBoardReady: true,
      opponentBoardReady: true,
      winner: null,
      opponentBoard: null,
      boardVerified: null,
      announcement: '',
    };

    it('P2P_GAME_LOADED with resumable phase (my-turn) populates p2pGame', () => {
      const store = makeStore();
      store.dispatch(p2pGameLoaded(loadedGame));
      expect(selectP2pGame(store.getState())).toMatchObject({phase: 'my-turn', opponentId: 'peer-saved'});
    });

    it('P2P_GAME_LOADED with non-resumable phase (game-over) is ignored', () => {
      const store = makeStore();
      store.dispatch(p2pGameLoaded({...loadedGame, phase: 'game-over'}));
      expect(selectP2pGame(store.getState())).toBeNull();
    });

    it('P2P_GAME_LOADED when current game is disconnected uses loaded state opponentId', () => {
      const store = makeStore();
      store.dispatch(challengePeer('peer-active'));
      store.dispatch(acceptChallenge());
      store.dispatch(p2pBoardReady('abc123'));
      store.dispatch(opponentBoardReady('def456'));
      store.dispatch(turnOrderDecided(true));
      store.dispatch(peerDisconnected('peer-active'));
      store.dispatch(p2pGameLoaded(loadedGame));
      expect(selectP2pGame(store.getState())).toMatchObject({phase: 'my-turn', opponentId: 'peer-saved'});
    });

    it('P2P_GAME_LOADED when no current game uses loaded state as-is', () => {
      const store = makeStore();
      store.dispatch(p2pGameLoaded({...loadedGame, phase: 'their-turn'}));
      expect(selectP2pGame(store.getState())).toMatchObject({phase: 'their-turn', opponentId: 'peer-saved'});
    });
  });
});

describe('board', () => {
  it('LOAD_BOARD sets boardLoading to true', () => {
    const store = makeStore();
    store.dispatch({type: 'LOAD_BOARD'});
    expect(selectBoardLoading(store.getState())).toBe(true);
  });

  it('BOARD_LOADED sets board and clears loading', () => {
    const store = makeStore();
    const board: Board = {placed: []};
    store.dispatch({type: 'LOAD_BOARD'});
    store.dispatch(boardLoaded(board));
    expect(selectBoard(store.getState())).toEqual(board);
    expect(selectBoardLoading(store.getState())).toBe(false);
  });

  it('BOARD_NOT_FOUND clears board and loading', () => {
    const store = makeStore();
    store.dispatch({type: 'LOAD_BOARD'});
    store.dispatch(boardNotFound());
    expect(selectBoard(store.getState())).toBeNull();
    expect(selectBoardLoading(store.getState())).toBe(false);
  });

  it('SAVE_BOARD stores the board', () => {
    const store = makeStore();
    const board: Board = {placed: []};
    store.dispatch(saveBoard(board));
    expect(selectBoard(store.getState())).toEqual(board);
  });
});

describe('AI game', () => {
  const aiGame: AiGameState = {
    playerShots: [],
    aiShots: [],
    phase: 'player-turn',
    announcement: '',
  };

  it('GAME_STARTED sets AI game state', () => {
    const store = makeStore();
    store.dispatch(gameStarted(aiGame));
    expect(selectAiGameState(store.getState())).toEqual(aiGame);
  });

  it('GAME_STATE sets AI game state', () => {
    const store = makeStore();
    store.dispatch(gameStateReceived(aiGame));
    expect(selectAiGameState(store.getState())).toEqual(aiGame);
  });

  it('GAME_NOT_FOUND clears AI game state', () => {
    const store = makeStore();
    store.dispatch(gameStarted(aiGame));
    store.dispatch(gameNotFound());
    expect(selectAiGameState(store.getState())).toBeNull();
  });

  it('FIRE_RESULT adds playerShot and updates phase', () => {
    const store = makeStore();
    store.dispatch(gameStarted(aiGame));
    const playerShot: Shot = {cell: {row: 0, col: 0}, result: 'miss'};
    store.dispatch(fireResult(playerShot, null, 'computer-turn'));
    const state = selectAiGameState(store.getState());
    expect(state?.playerShots).toEqual([playerShot]);
    expect(state?.phase).toBe('computer-turn');
  });

  it('FIRE_RESULT adds both player and AI shots', () => {
    const store = makeStore();
    store.dispatch(gameStarted(aiGame));
    const playerShot: Shot = {cell: {row: 0, col: 0}, result: 'miss'};
    const aiShot: Shot = {cell: {row: 3, col: 4}, result: 'hit'};
    store.dispatch(fireResult(playerShot, aiShot, 'player-turn'));
    const state = selectAiGameState(store.getState());
    expect(state?.playerShots).toEqual([playerShot]);
    expect(state?.aiShots).toEqual([aiShot]);
  });

  it('FIRE_RESULT sets announcement when ship is sunk', () => {
    const store = makeStore();
    store.dispatch(gameStarted(aiGame));
    const sunkShot: Shot = {cell: {row: 0, col: 0}, result: 'sunk', ship: {name: 'Destroyer', size: 2}};
    store.dispatch(fireResult(sunkShot, null, 'computer-turn'));
    expect(selectAiGameState(store.getState())?.announcement).toBe('Destroyer sunk!');
  });

  it('FIRE_RESULT does nothing when no game state', () => {
    const store = makeStore();
    const playerShot: Shot = {cell: {row: 0, col: 0}, result: 'miss'};
    store.dispatch(fireResult(playerShot, null, 'computer-turn'));
    expect(selectAiGameState(store.getState())).toBeNull();
  });
});

describe('peer tracking', () => {
  it('PEER_NAMED records opponent name', () => {
    const store = makeStore();
    store.dispatch(peerNamed('peer-bob', 'Bob'));
    expect(selectOpponentNames(store.getState())).toEqual({'peer-bob': 'Bob'});
  });

  it('PEER_CONNECTED as offerer records peer id', () => {
    const store = makeStore();
    store.dispatch(peerConnected('peer-bob', true));
    expect(selectOffererPeerIds(store.getState())).toContain('peer-bob');
  });

  it('PEER_CONNECTED as non-offerer does not record peer id', () => {
    const store = makeStore();
    store.dispatch(peerConnected('peer-bob', false));
    expect(selectOffererPeerIds(store.getState())).not.toContain('peer-bob');
  });
});

describe('selectAnnouncement', () => {
  it('returns empty string when no game', () => {
    const store = makeStore();
    expect(selectAnnouncement(store.getState())).toBe('');
  });

  it('returns AI game announcement when in AI game', () => {
    const store = makeStore();
    const aiGame: AiGameState = {playerShots: [], aiShots: [], phase: 'player-turn', announcement: 'Destroyer sunk!'};
    store.dispatch(gameStarted(aiGame));
    expect(selectAnnouncement(store.getState())).toBe('Destroyer sunk!');
  });

  it('returns p2p game announcement when in p2p game', () => {
    const store = makeStore();
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
    store.dispatch(p2pBoardReady('abc123'));
    store.dispatch(opponentBoardReady('def456'));
    store.dispatch(turnOrderDecided(true));
    const sunkShot: Shot = {cell: {row: 0, col: 0}, result: 'sunk', ship: {name: 'Carrier', size: 5}};
    store.dispatch(p2pFireResult(sunkShot));
    expect(selectAnnouncement(store.getState())).toBe('Carrier sunk!');
  });
});

describe('selectGameView', () => {
  it('returns null when no game', () => {
    const store = makeStore();
    expect(selectGameView(store.getState())).toBeNull();
  });

  it('returns AI game view with my-turn phase', () => {
    const store = makeStore();
    const aiGame: AiGameState = {playerShots: [], aiShots: [], phase: 'player-turn', announcement: ''};
    store.dispatch(gameStarted(aiGame));
    const view = selectGameView(store.getState());
    expect(view).toMatchObject({phase: 'my-turn', opponentName: 'Computer'});
  });

  it('returns AI game view with their-turn phase', () => {
    const store = makeStore();
    const aiGame: AiGameState = {playerShots: [], aiShots: [], phase: 'computer-turn', announcement: ''};
    store.dispatch(gameStarted(aiGame));
    const view = selectGameView(store.getState());
    expect(view?.phase).toBe('their-turn');
  });

  it('returns AI game view with won phase on player-won', () => {
    const store = makeStore();
    const aiGame: AiGameState = {playerShots: [], aiShots: [], phase: 'player-won', announcement: ''};
    store.dispatch(gameStarted(aiGame));
    expect(selectGameView(store.getState())?.phase).toBe('won');
  });

  it('returns AI game view with lost phase on computer-won', () => {
    const store = makeStore();
    const aiGame: AiGameState = {playerShots: [], aiShots: [], phase: 'computer-won', announcement: ''};
    store.dispatch(gameStarted(aiGame));
    expect(selectGameView(store.getState())?.phase).toBe('lost');
  });

  it('returns null for p2p game when not in active phase', () => {
    const store = makeStore();
    store.dispatch(challengePeer('peer-bob'));
    expect(selectGameView(store.getState())).toBeNull();
  });

  it('returns p2p game view with opponent name from opponentNames', () => {
    const store = makeStore();
    store.dispatch(peerNamed('peer-bob', 'Bob'));
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
    store.dispatch(p2pBoardReady('abc123'));
    store.dispatch(opponentBoardReady('def456'));
    store.dispatch(turnOrderDecided(true));
    const view = selectGameView(store.getState());
    expect(view?.opponentName).toBe('Bob');
  });

  it('returns p2p game view with Opponent fallback when name unknown', () => {
    const store = makeStore();
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
    store.dispatch(p2pBoardReady('abc123'));
    store.dispatch(opponentBoardReady('def456'));
    store.dispatch(turnOrderDecided(true));
    const view = selectGameView(store.getState());
    expect(view?.opponentName).toBe('Opponent');
  });

  it('returns p2p game view with won phase', () => {
    const store = makeStore();
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
    store.dispatch(p2pBoardReady('abc123'));
    store.dispatch(opponentBoardReady('def456'));
    store.dispatch(turnOrderDecided(true));
    store.dispatch(p2pGameOver('me'));
    const view = selectGameView(store.getState());
    expect(view?.phase).toBe('won');
  });

  it('returns p2p game view with lost phase', () => {
    const store = makeStore();
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
    store.dispatch(p2pBoardReady('abc123'));
    store.dispatch(opponentBoardReady('def456'));
    store.dispatch(turnOrderDecided(true));
    store.dispatch(p2pGameOver('opponent'));
    const view = selectGameView(store.getState());
    expect(view?.phase).toBe('lost');
  });

  it('returns p2p game view with disconnected phase', () => {
    const store = makeStore();
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
    store.dispatch(p2pBoardReady('abc123'));
    store.dispatch(opponentBoardReady('def456'));
    store.dispatch(turnOrderDecided(true));
    store.dispatch(peerDisconnected('peer-bob'));
    const view = selectGameView(store.getState());
    expect(view?.phase).toBe('disconnected');
  });

  it('returns p2p game view with state-mismatch phase', () => {
    const store = makeStore();
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
    store.dispatch(p2pBoardReady('abc123'));
    store.dispatch(opponentBoardReady('def456'));
    store.dispatch(turnOrderDecided(true));
    store.dispatch(p2pStateMismatch());
    const view = selectGameView(store.getState());
    expect(view?.phase).toBe('state-mismatch');
  });
});

describe('server message handling', () => {
  const createStoreWithPort = () => {
    const {port, emit} = createConnectionPort({
      sendToPeer: () => {},
      sendToServer: () => {},
    });
    const store = createGameStore({port});
    return {store, emit};
  };

  it('loads board and game on REGISTERED', () => {
    const {store, emit} = createStoreWithPort();
    emit({type: 'SERVER_MESSAGE', data: {type: 'REGISTERED'}});
    expect(selectBoardLoading(store.getState())).toBe(true);
  });

  it('handles BOARD_SAVED without crashing', () => {
    const {store, emit} = createStoreWithPort();
    emit({type: 'SERVER_MESSAGE', data: {type: 'BOARD_SAVED'}});
    expect(store.getState()).toBeDefined();
  });

  it('sets board on BOARD_LOADED', () => {
    const {store, emit} = createStoreWithPort();
    const board: Board = {placed: [{ship: {name: 'Carrier', size: 5}, position: {row: 1, col: 1}, orientation: 'horizontal'}]};
    emit({type: 'SERVER_MESSAGE', data: {type: 'BOARD_LOADED', board}});
    expect(selectBoard(store.getState())).toEqual(board);
  });

  it('clears board loading on BOARD_NOT_FOUND', () => {
    const {store, emit} = createStoreWithPort();
    emit({type: 'SERVER_MESSAGE', data: {type: 'REGISTERED'}});
    emit({type: 'SERVER_MESSAGE', data: {type: 'BOARD_NOT_FOUND'}});
    expect(selectBoardLoading(store.getState())).toBe(false);
    expect(selectBoard(store.getState())).toBeNull();
  });

  it('starts AI game on GAME_STARTED', () => {
    const {store, emit} = createStoreWithPort();
    const gameState: AiGameState = {playerShots: [], aiShots: [], phase: 'player-turn', announcement: ''};
    emit({type: 'SERVER_MESSAGE', data: {type: 'GAME_STARTED', gameState}});
    expect(selectAiGameState(store.getState())).toEqual(gameState);
  });

  it('receives fire result', () => {
    const {store, emit} = createStoreWithPort();
    const gameState: AiGameState = {playerShots: [], aiShots: [], phase: 'player-turn', announcement: ''};
    emit({type: 'SERVER_MESSAGE', data: {type: 'GAME_STARTED', gameState}});
    const playerShot: Shot = {cell: {row: 1, col: 1}, result: 'miss'};
    emit({type: 'SERVER_MESSAGE', data: {type: 'FIRE_RESULT', playerShot, phase: 'computer-turn'}});
    expect(selectAiGameState(store.getState())?.playerShots).toHaveLength(1);
    expect(selectAiGameState(store.getState())?.phase).toBe('computer-turn');
  });

  it('receives game state', () => {
    const {store, emit} = createStoreWithPort();
    const gameState: AiGameState = {playerShots: [{cell: {row: 1, col: 1}, result: 'hit'}], aiShots: [], phase: 'player-turn', announcement: ''};
    emit({type: 'SERVER_MESSAGE', data: {type: 'GAME_STATE', gameState}});
    expect(selectAiGameState(store.getState())).toEqual(gameState);
  });

  it('handles GAME_NOT_FOUND', () => {
    const {store, emit} = createStoreWithPort();
    emit({type: 'SERVER_MESSAGE', data: {type: 'REGISTERED'}});
    emit({type: 'SERVER_MESSAGE', data: {type: 'GAME_NOT_FOUND'}});
    expect(selectAiGameState(store.getState())).toBeNull();
  });

  it('loads P2P game with peer ID translation', () => {
    const {port, emit} = createConnectionPort({
      sendToPeer: () => {},
      sendToServer: () => {},
    });
    const store = createGameStore({
      port,
      translatePeerId: (id) => id === 'signaling-123' ? 'local-456' : undefined,
    });
    const gameState = JSON.stringify({
      opponentId: 'signaling-123',
      phase: 'my-turn',
      myBoardHash: 'abc',
      myShots: [],
      opponentShots: [],
      myBoardReady: true,
      opponentBoardReady: true,
    });
    emit({type: 'SERVER_MESSAGE', data: {type: 'P2P_GAME_LOADED', gameState}});
    expect(selectP2pGame(store.getState())?.opponentId).toBe('local-456');
    expect(selectP2pGame(store.getState())?.phase).toBe('my-turn');
  });

  it('loads P2P game without translation when no mapping exists', () => {
    const {port, emit} = createConnectionPort({
      sendToPeer: () => {},
      sendToServer: () => {},
    });
    const store = createGameStore({
      port,
      translatePeerId: () => undefined,
    });
    const gameState = JSON.stringify({
      opponentId: 'signaling-123',
      phase: 'their-turn',
      myBoardHash: 'abc',
      myShots: [],
      opponentShots: [],
      myBoardReady: true,
      opponentBoardReady: true,
    });
    emit({type: 'SERVER_MESSAGE', data: {type: 'P2P_GAME_LOADED', gameState}});
    expect(selectP2pGame(store.getState())?.opponentId).toBe('signaling-123');
    expect(selectP2pGame(store.getState())?.phase).toBe('their-turn');
  });

  it('ignores P2P_GAME_LOADED with invalid JSON', () => {
    const {store, emit} = createStoreWithPort();
    emit({type: 'SERVER_MESSAGE', data: {type: 'P2P_GAME_LOADED', gameState: 'not-json'}});
    expect(selectP2pGame(store.getState())).toBeNull();
  });

  it('ignores unknown server message types without crashing', () => {
    const {store, emit} = createStoreWithPort();
    emit({type: 'SERVER_MESSAGE', data: {type: 'UNKNOWN_EVENT'}});
    expect(store.getState()).toBeDefined();
  });
});
