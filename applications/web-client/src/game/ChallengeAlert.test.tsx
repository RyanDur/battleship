import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ChallengeAlert} from './ChallengeAlert';
import {GameProvider} from './GameProvider';
import {createGameStore} from './gameStore';
import {challengeReceived, peerNamed} from './gameActions';
import {selectP2pGame} from './gameSelectors';

const setup = () => {
  const store = createGameStore();
  render(<GameProvider store={store}><ChallengeAlert/></GameProvider>);
  return {store};
};

describe('ChallengeAlert', () => {
  it('renders nothing when there is no challenge', () => {
    setup();
    expect(screen.queryByText(/wants to play/i)).not.toBeInTheDocument();
  });

  it('shows alert when challenge is received', async () => {
    const {store} = setup();
    await act(async () => store.dispatch(challengeReceived('peer-1')));
    expect(screen.getByText(/someone wants to play you/i)).toBeInTheDocument();
  });

  it('shows opponent name when known', async () => {
    const {store} = setup();
    await act(async () => {
      store.dispatch(peerNamed('peer-1', 'Alice'));
      store.dispatch(challengeReceived('peer-1'));
    });
    expect(screen.getByText(/alice wants to play you/i)).toBeInTheDocument();
  });

  it('shows accept and decline buttons', async () => {
    const {store} = setup();
    await act(async () => store.dispatch(challengeReceived('peer-1')));
    expect(screen.getByRole('button', {name: /accept/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /decline/i})).toBeInTheDocument();
  });

  it('clicking accept dispatches ACCEPT_CHALLENGE', async () => {
    const user = userEvent.setup();
    const {store} = setup();
    await act(async () => store.dispatch(challengeReceived('peer-1')));
    await user.click(screen.getByRole('button', {name: /accept/i}));
    expect(selectP2pGame(store.getState())?.phase).toBe('placing');
  });

  it('clicking decline dispatches DECLINE_CHALLENGE', async () => {
    const user = userEvent.setup();
    const {store} = setup();
    await act(async () => store.dispatch(challengeReceived('peer-1')));
    await user.click(screen.getByRole('button', {name: /decline/i}));
    expect(selectP2pGame(store.getState())).toBeNull();
  });
});
