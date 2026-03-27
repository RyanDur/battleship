import {render, screen, within, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Game} from './GameView';
import {GameProvider} from './GameProvider';
import {createGameStore} from './gameStore';
import {gameStarted, fireResult, challengePeer, acceptChallenge, p2pBoardReady, opponentBoardReady, turnOrderDecided, opponentForfeited, peerNamed} from './gameActions';
import type {AiGameState, Shot} from './game';

const emptyGameState: AiGameState = {playerShots: [], aiShots: [], phase: 'player-turn', announcement: ''};

const playerShot = (row: number, col: number, result: Shot['result'], ship?: Shot['ship']): Shot =>
  ({cell: {row, col}, result, ...(ship ? {ship} : {})});

const aiShot = (row: number, col: number, result: Shot['result']): Shot =>
  ({cell: {row, col}, result});

const renderGame = (initialState = emptyGameState, onNewGame = () => {}) => {
  const gameStore = createGameStore();
  act(() => { gameStore.dispatch(gameStarted(initialState)); });
  render(
    <GameProvider store={gameStore}>
      <Game onNewGame={onNewGame}/>
    </GameProvider>
  );
  return gameStore;
};

describe('Game', () => {
  it('shows Your Fleet and Tracking Board regions', () => {
    renderGame();
    expect(screen.getByRole('region', {name: /your fleet/i})).toBeInTheDocument();
    expect(screen.getByRole('region', {name: /tracking board/i})).toBeInTheDocument();
  });

  it('each board has a 10x10 grid', () => {
    renderGame();
    expect(within(screen.getByRole('region', {name: /your fleet/i}))
      .getAllByRole('button', {name: /^row/i})).toHaveLength(100);
    expect(within(screen.getByRole('region', {name: /tracking board/i}))
      .getAllByRole('button', {name: /^row/i})).toHaveLength(100);
  });

  it('shows miss on tracking board after player fires', async () => {
    const user = userEvent.setup();
    const store = renderGame();
    const tracking = screen.getByRole('region', {name: /tracking board/i});
    await user.click(within(tracking).getByRole('button', {name: 'Row 6, Column 6'}));
    act(() => { store.dispatch(fireResult(playerShot(6, 6, 'miss'), null, 'player-turn')); });
    await waitFor(() => expect(tracking).toHaveTextContent(/miss/i));
  });

  it('shows hit on tracking board after player fires', async () => {
    const user = userEvent.setup();
    const store = renderGame();
    const tracking = screen.getByRole('region', {name: /tracking board/i});
    await user.click(within(tracking).getByRole('button', {name: 'Row 1, Column 1'}));
    act(() => { store.dispatch(fireResult(playerShot(1, 1, 'hit'), null, 'player-turn')); });
    await waitFor(() => expect(tracking).toHaveTextContent(/hit/i));
  });

  it('shows AI shot on fleet board after player fires', async () => {
    const user = userEvent.setup();
    const store = renderGame();
    const tracking = screen.getByRole('region', {name: /tracking board/i});
    await user.click(within(tracking).getByRole('button', {name: 'Row 1, Column 1'}));
    act(() => { store.dispatch(fireResult(playerShot(1, 1, 'miss'), aiShot(2, 2, 'hit'), 'player-turn')); });
    await waitFor(() =>
      expect(screen.getByRole('region', {name: /your fleet/i})).toHaveTextContent(/hit/i)
    );
  });

  it('fired tracking cells are disabled', async () => {
    const user = userEvent.setup();
    const store = renderGame();
    const tracking = screen.getByRole('region', {name: /tracking board/i});
    await user.click(within(tracking).getByRole('button', {name: 'Row 6, Column 6'}));
    act(() => { store.dispatch(fireResult(playerShot(6, 6, 'miss'), null, 'player-turn')); });
    await waitFor(() =>
      expect(within(tracking).getByRole('button', {name: 'Row 6, Column 6'})).toBeDisabled()
    );
  });

  it('announces sunk ship name', async () => {
    const user = userEvent.setup();
    const store = renderGame();
    const tracking = screen.getByRole('region', {name: /tracking board/i});
    await user.click(within(tracking).getByRole('button', {name: 'Row 5, Column 1'}));
    act(() => {
      store.dispatch(fireResult(
        playerShot(5, 1, 'sunk', {name: 'Destroyer', size: 2}),
        aiShot(1, 1, 'miss'),
        'player-turn',
      ));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/destroyer/i));
  });

  it('shows You win heading when phase is player-won', async () => {
    const user = userEvent.setup();
    const store = renderGame();
    const tracking = screen.getByRole('region', {name: /tracking board/i});
    await user.click(within(tracking).getByRole('button', {name: 'Row 1, Column 1'}));
    act(() => { store.dispatch(fireResult(playerShot(1, 1, 'sunk'), null, 'player-won')); });
    await waitFor(() =>
      expect(screen.getByRole('heading', {name: /you win/i})).toBeInTheDocument()
    );
  });

  it('shows New game button when game ends', async () => {
    const user = userEvent.setup();
    const store = renderGame();
    const tracking = screen.getByRole('region', {name: /tracking board/i});
    await user.click(within(tracking).getByRole('button', {name: 'Row 1, Column 1'}));
    act(() => { store.dispatch(fireResult(playerShot(1, 1, 'sunk'), null, 'player-won')); });
    await waitFor(() =>
      expect(screen.getByRole('button', {name: /new game/i})).toBeInTheDocument()
    );
  });

  it('calls onNewGame when New game button clicked', async () => {
    const user = userEvent.setup();
    let called = false;
    const store = renderGame(emptyGameState, () => { called = true; });
    const tracking = screen.getByRole('region', {name: /tracking board/i});
    await user.click(within(tracking).getByRole('button', {name: 'Row 1, Column 1'}));
    act(() => { store.dispatch(fireResult(playerShot(1, 1, 'sunk'), null, 'player-won')); });
    await waitFor(() => screen.getByRole('button', {name: /new game/i}));
    await user.click(screen.getByRole('button', {name: /new game/i}));
    expect(called).toBe(true);
  });

  it('does not show forfeit button in AI game', () => {
    renderGame();
    expect(screen.queryByRole('button', {name: /forfeit/i})).not.toBeInTheDocument();
  });
});

describe('P2P game forfeit', () => {
  const renderP2pGame = (iGoFirst: boolean, onNewGame = () => {}) => {
    const gameStore = createGameStore();
    act(() => {
      gameStore.dispatch(challengePeer('peer-bob'));
      gameStore.dispatch(peerNamed('peer-bob', 'Bob'));
      gameStore.dispatch(acceptChallenge());
      gameStore.dispatch(p2pBoardReady('abc123'));
      gameStore.dispatch(opponentBoardReady('def456'));
      gameStore.dispatch(turnOrderDecided(iGoFirst));
    });
    render(
      <GameProvider store={gameStore}>
        <Game onNewGame={onNewGame}/>
      </GameProvider>
    );
    return gameStore;
  };

  it('shows forfeit button during p2p gameplay', () => {
    renderP2pGame(true);
    expect(screen.getByRole('button', {name: /^forfeit/i})).toBeInTheDocument();
  });

  it('shows confirmation after clicking forfeit', async () => {
    const user = userEvent.setup();
    renderP2pGame(true);
    await user.click(screen.getByRole('button', {name: /^forfeit/i}));
    expect(screen.getByRole('button', {name: /are you sure/i})).toBeInTheDocument();
  });

  it('forfeiting dispatches FORFEIT_GAME and transitions to game-over as loser', async () => {
    const user = userEvent.setup();
    renderP2pGame(true);
    await user.click(screen.getByRole('button', {name: /^forfeit/i}));
    await user.click(screen.getByRole('button', {name: /are you sure/i}));
    await waitFor(() => expect(screen.getByRole('heading', {name: /wins/i})).toBeInTheDocument());
  });

  it('shows Player forfeited message when opponent forfeits', async () => {
    const store = renderP2pGame(false);
    act(() => { store.dispatch(opponentForfeited()); });
    await waitFor(() => expect(screen.getByText(/forfeited/i)).toBeInTheDocument());
  });
});
