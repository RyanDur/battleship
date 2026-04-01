import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ChallengeAlert} from './ChallengeAlert';
import {GameProvider} from './GameProvider';
import {createGameStore} from './gameStore';
import type {GameAction} from './game';
import {challengeReceived, peerNamed} from './gameActions';
import {StoreProvider} from '../connections/StoreProvider';
import {createAppStore} from '../connections/store';

const setup = () => {
  const gameStore = createGameStore();
  const appStore = createAppStore();
  const dispatched: GameAction[] = [];
  gameStore.addListener((action) => { dispatched.push(action); });
  render(
    <StoreProvider store={appStore}>
      <GameProvider store={gameStore}>
        <ChallengeAlert/>
      </GameProvider>
    </StoreProvider>,
  );
  return {gameStore, appStore, dispatched};
};

describe('ChallengeAlert', () => {
  it('renders nothing when there is no challenge', () => {
    setup();
    expect(screen.queryByText(/wants to play/i)).not.toBeInTheDocument();
  });

  it('shows alert when challenge is received', async () => {
    const {gameStore} = setup();
    await act(async () => gameStore.dispatch(challengeReceived('peer-1')));
    expect(screen.getByText(/someone wants to play you/i)).toBeInTheDocument();
  });

  it('shows opponent name when known', async () => {
    const {gameStore} = setup();
    await act(async () => {
      gameStore.dispatch(peerNamed('peer-1', 'Alice'));
      gameStore.dispatch(challengeReceived('peer-1'));
    });
    expect(screen.getByText(/alice wants to play you/i)).toBeInTheDocument();
  });

  it('shows accept and decline buttons', async () => {
    const {gameStore} = setup();
    await act(async () => gameStore.dispatch(challengeReceived('peer-1')));
    expect(screen.getByRole('button', {name: /accept/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /decline/i})).toBeInTheDocument();
  });

  it('clicking accept dispatches ACCEPT_CHALLENGE to game store', async () => {
    const user = userEvent.setup();
    const {gameStore, dispatched} = setup();
    await act(async () => gameStore.dispatch(challengeReceived('peer-1')));
    await user.click(screen.getByRole('button', {name: /accept/i}));
    expect(dispatched.some(a => a.type === 'ACCEPT_CHALLENGE')).toBe(true);
  });

  it('clicking decline dispatches DECLINE_CHALLENGE to game store', async () => {
    const user = userEvent.setup();
    const {gameStore, dispatched} = setup();
    await act(async () => gameStore.dispatch(challengeReceived('peer-1')));
    await user.click(screen.getByRole('button', {name: /decline/i}));
    expect(dispatched.some(a => a.type === 'DECLINE_CHALLENGE')).toBe(true);
  });
});
