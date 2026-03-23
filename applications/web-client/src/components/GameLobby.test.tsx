import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {GameLobby} from './GameLobby';
import {ConnectionProvider} from '../state/ConnectionProvider';
import {createConnectionStore} from '../state/connectionStore';
import {boardLoaded, challengePeer, acceptChallenge} from '../state/connectionActions';
import type {Board} from '../game/board';

const emptyBoard: Board = {placed: []};

const renderLobby = (onSetupBoard = () => {}) => {
  const store = createConnectionStore();
  act(() => {
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
  });
  render(
    <ConnectionProvider store={store}>
      <GameLobby onSetupBoard={onSetupBoard}/>
    </ConnectionProvider>
  );
  return store;
};

const renderLobbyWithBoard = (onSetupBoard = () => {}) => {
  const store = createConnectionStore();
  act(() => {
    store.dispatch(boardLoaded(emptyBoard));
    store.dispatch(challengePeer('peer-bob'));
    store.dispatch(acceptChallenge());
  });
  render(
    <ConnectionProvider store={store}>
      <GameLobby onSetupBoard={onSetupBoard}/>
    </ConnectionProvider>
  );
  return store;
};

describe('GameLobby', () => {
  it('shows Place ships when player has no board', () => {
    renderLobby();
    expect(screen.getByRole('button', {name: /place ships/i})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /use this board/i})).not.toBeInTheDocument();
  });

  it('shows Use this board and Re-place ships when player has a board', () => {
    renderLobbyWithBoard();
    expect(screen.getByRole('button', {name: /use this board/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /re-place ships/i})).toBeInTheDocument();
  });

  it('calls onSetupBoard when Place ships is clicked', async () => {
    const onSetupBoard = vi.fn();
    renderLobby(onSetupBoard);
    await userEvent.click(screen.getByRole('button', {name: /place ships/i}));
    expect(onSetupBoard).toHaveBeenCalledOnce();
  });

  it('calls onSetupBoard when Re-place ships is clicked', async () => {
    const onSetupBoard = vi.fn();
    renderLobbyWithBoard(onSetupBoard);
    await userEvent.click(screen.getByRole('button', {name: /re-place ships/i}));
    expect(onSetupBoard).toHaveBeenCalledOnce();
  });

  it('shows Waiting for opponent after committing board', () => {
    const store = renderLobbyWithBoard();
    act(() => { store.dispatch({type: 'P2P_BOARD_READY', boardHash: 'abc'} as never); });
    expect(screen.getByText(/waiting/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /use this board/i})).not.toBeInTheDocument();
  });
});
