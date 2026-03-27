import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {GameLobby} from './GameLobby';
import {GameProvider} from './GameProvider';
import {createGameStore} from './gameStore';
import {boardLoaded, challengePeer, acceptChallenge, p2pBoardReady, opponentBoardReady} from './gameActions';
import type {Board} from './board';
import {ConnectionProvider} from '../connections/ConnectionProvider';
import {createConnectionStore} from '../connections/connectionStore';

const emptyBoard: Board = {placed: []};

const renderLobby = (onSetupBoard = () => {}) => {
  const gameStore = createGameStore();
  const connectionStore = createConnectionStore();
  act(() => {
    gameStore.dispatch(challengePeer('peer-bob'));
    gameStore.dispatch(acceptChallenge());
  });
  render(
    <ConnectionProvider store={connectionStore}>
      <GameProvider store={gameStore}>
        <GameLobby onSetupBoard={onSetupBoard}/>
      </GameProvider>
    </ConnectionProvider>
  );
  return gameStore;
};

const renderLobbyWithBoard = (onSetupBoard = () => {}) => {
  const gameStore = createGameStore();
  const connectionStore = createConnectionStore();
  act(() => {
    gameStore.dispatch(boardLoaded(emptyBoard));
    gameStore.dispatch(challengePeer('peer-bob'));
    gameStore.dispatch(acceptChallenge());
  });
  render(
    <ConnectionProvider store={connectionStore}>
      <GameProvider store={gameStore}>
        <GameLobby onSetupBoard={onSetupBoard}/>
      </GameProvider>
    </ConnectionProvider>
  );
  return gameStore;
};

const renderLobbySelectingTurn = (onSetupBoard = () => {}) => {
  const gameStore = createGameStore();
  const connectionStore = createConnectionStore();
  act(() => {
    gameStore.dispatch(challengePeer('peer-bob'));
    gameStore.dispatch(acceptChallenge());
    gameStore.dispatch(p2pBoardReady('abc123'));
    gameStore.dispatch(opponentBoardReady('def456'));
  });
  render(
    <ConnectionProvider store={connectionStore}>
      <GameProvider store={gameStore}>
        <GameLobby onSetupBoard={onSetupBoard}/>
      </GameProvider>
    </ConnectionProvider>
  );
  return gameStore;
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

describe('GameLobby turn selection', () => {
  it('shows Go first and Flip coin buttons when both boards are ready', () => {
    renderLobbySelectingTurn();
    expect(screen.getByRole('button', {name: /go first/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /flip coin/i})).toBeInTheDocument();
  });
});
