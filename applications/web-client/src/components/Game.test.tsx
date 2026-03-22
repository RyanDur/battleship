import {render, screen, within, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Game} from './Game';
import {ConnectionProvider} from '../state/ConnectionProvider';
import {createConnectionStore} from '../state/connectionStore';
import {gameStarted, fireResult} from '../state/connectionActions';
import type {GameState, Shot} from '../state/connections';

const emptyGameState: GameState = {playerShots: [], aiShots: [], phase: 'player-turn'};

const playerShot = (row: number, col: number, result: Shot['result'], ship?: Shot['ship']): Shot =>
  ({cell: {row, col}, result, ...(ship ? {ship} : {})});

const aiShot = (row: number, col: number, result: Shot['result']): Shot =>
  ({cell: {row, col}, result});

const renderGame = (initialState = emptyGameState, onNewGame = () => {}) => {
  const store = createConnectionStore();
  act(() => { store.dispatch(gameStarted(initialState)); });
  render(
    <ConnectionProvider store={store}>
      <Game onNewGame={onNewGame}/>
    </ConnectionProvider>
  );
  return store;
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
});
