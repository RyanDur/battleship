import {render, screen, act, within, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Comms} from './Comms';
import {ConnectionProvider} from '../state/ConnectionProvider';
import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from '../state/connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import {messageReceived, sendMessage} from '../state/connectionActions';
import {selectMessages} from '../state/connectionSelectors';
import {GameProvider} from '../game/GameProvider';
import {createGameStore} from '../game/gameStore';

const makeStore = () => {
  const factory = createFakePeerConnectionFactory();
  const store = createConnectionStore(
    applyMiddleware([encodingMiddleware, codecMiddleware]),
    [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
  );
  return {store};
};

const setup = (peerId: string | null = null, peerName: string | null = null) => {
  const {store} = makeStore();
  const gameStore = createGameStore();
  render(
    <GameProvider store={gameStore}>
      <ConnectionProvider store={store}>
        <Comms peerId={peerId} peerName={peerName}/>
      </ConnectionProvider>
    </GameProvider>
  );
  return {store};
};

describe('Comms', () => {
  it('shows the comms panel as a complementary landmark', () => {
    setup();

    expect(screen.getByRole('complementary', {name: /communications/i})).toBeInTheDocument();
  });

  it('shows the alerts section inside the communications panel', () => {
    setup();

    const comms = screen.getByRole('complementary', {name: /communications/i});
    expect(within(comms).getByRole('group', {name: /alerts/i})).toBeInTheDocument();
  });

  it('is expanded by default', () => {
    setup();

    expect(screen.getByRole('group', {name: /comms/i})).toHaveAttribute('open');
  });

  it('shows no conversation when no peer is selected', () => {
    setup();

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows message thread when peer is selected', async () => {
    const {store} = setup('p1', 'Alice');

    await act(async () => store.dispatch(messageReceived('p1', 'Hello!')));

    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('shows received messages labeled with peer name', async () => {
    const {store} = setup('p1', 'Alice');

    await act(async () => store.dispatch(messageReceived('p1', 'Hello!')));

    expect(screen.getByText(/alice.*hello!/i)).toBeInTheDocument();
  });

  it('shows sent messages labeled as You', async () => {
    const {store} = setup('p1', 'Alice');

    await act(async () => store.dispatch(sendMessage('p1', 'Hi there')));

    await within(screen.getByRole('list')).findByText(/you.*hi there/i);
  });

  it('shows messages in time order', async () => {
    const {store} = setup('p1', 'Alice');

    await act(async () => {
      store.dispatch(messageReceived('p1', 'First'));
      store.dispatch(sendMessage('p1', 'Second'));
      store.dispatch(messageReceived('p1', 'Third'));
    });

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/first/i);
    expect(items[1]).toHaveTextContent(/second/i);
    expect(items[2]).toHaveTextContent(/third/i);
  });

  it('only shows messages for the selected peer', async () => {
    const {store} = setup('p1', 'Alice');

    await act(async () => {
      store.dispatch(messageReceived('p1', 'From Alice'));
      store.dispatch(messageReceived('p2', 'From Bob'));
    });

    expect(screen.getByText(/from alice/i)).toBeInTheDocument();
    expect(screen.queryByText(/from bob/i)).not.toBeInTheDocument();
  });

  it('shows message input and send button when peer is selected', () => {
    setup('p1', 'Alice');

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /send/i})).toBeInTheDocument();
  });

  it('sending a message dispatches it to the store', async () => {
    const user = userEvent.setup();
    const {store} = setup('p1', 'Alice');

    await user.type(screen.getByRole('textbox'), 'Hey there');
    await user.click(screen.getByRole('button', {name: /send/i}));

    expect(selectMessages(store.getState()).filter(m => m.peerId === 'p1')).toHaveLength(1);
  });

  it('sending a message clears the input', async () => {
    const user = userEvent.setup();
    setup('p1', 'Alice');

    await user.type(screen.getByRole('textbox'), 'Hey there');
    await user.click(screen.getByRole('button', {name: /send/i}));

    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('unread count live region is present', () => {
    setup();

    expect(within(screen.getByRole('group', {name: /comms/i})).getByRole('status')).toBeInTheDocument();
  });

  it('unread count is empty when panel is open', async () => {
    const {store} = setup('p1', 'Alice');

    await act(async () => store.dispatch(messageReceived('p1', 'Hello!')));

    expect(within(screen.getByRole('group', {name: /comms/i})).getByRole('status')).toHaveTextContent('');
  });

  it('unread count increments when panel is collapsed and messages arrive', async () => {
    const user = userEvent.setup();
    const {store} = setup('p1', 'Alice');

    const comms = screen.getByRole('group', {name: /comms/i});
    await user.click(comms.querySelector('summary')!);
    await act(async () => store.dispatch(messageReceived('p1', 'Hello!')));
    await act(async () => store.dispatch(messageReceived('p1', 'Another!')));

    expect(within(screen.getByRole('group', {name: /comms/i})).getByRole('status')).toHaveTextContent('2');
  });

  it('unread count resets when panel is expanded', async () => {
    const user = userEvent.setup();
    const {store} = setup('p1', 'Alice');

    const comms = screen.getByRole('group', {name: /comms/i});
    const summary = comms.querySelector('summary')!;
    await user.click(summary);
    await act(async () => store.dispatch(messageReceived('p1', 'Hello!')));
    await user.click(summary);

    expect(within(screen.getByRole('group', {name: /comms/i})).getByRole('status')).toHaveTextContent('');
  });

  it('summary shows last message sender and text when collapsed', async () => {
    const user = userEvent.setup();
    const {store} = setup('p1', 'Alice');

    await act(async () => store.dispatch(messageReceived('p1', 'First message')));
    await act(async () => store.dispatch(messageReceived('p1', 'Latest message')));

    const comms = screen.getByRole('group', {name: /comms/i});
    await user.click(comms.querySelector('summary')!);

    const summary = screen.getByRole('group', {name: /comms/i}).querySelector('summary')!;
    expect(summary).toHaveTextContent(/alice/i);
    expect(summary).toHaveTextContent(/latest message/i);
  });

  it('switching peers while collapsed resets unread count for the new peer', async () => {
    const user = userEvent.setup();
    const {store} = makeStore();
    const gameStore = createGameStore();
    const {rerender} = render(
      <GameProvider store={gameStore}>
        <ConnectionProvider store={store}>
          <Comms peerId="p1" peerName="Alice"/>
        </ConnectionProvider>
      </GameProvider>
    );

    // Give Alice several messages so seenCount gets set on open
    await act(async () => {
      store.dispatch(messageReceived('p1', 'Alice 1'));
      store.dispatch(messageReceived('p1', 'Alice 2'));
      store.dispatch(messageReceived('p1', 'Alice 3'));
    });
    // Bob has fewer messages pre-loaded
    await act(async () => store.dispatch(messageReceived('p2', 'Bob 1')));

    // Open panel (seenCount set to 3 for Alice)
    const comms = screen.getByRole('group', {name: /comms/i});
    const summary = comms.querySelector('summary')!;
    await user.click(summary); // close
    await user.click(summary); // open → seenCount = 3
    await user.click(summary); // close

    // Switch to Bob — seenCount (3) > Bob messages (1), would wrongly show 0
    rerender(
      <GameProvider store={gameStore}>
        <ConnectionProvider store={store}>
          <Comms peerId="p2" peerName="Bob"/>
        </ConnectionProvider>
      </GameProvider>
    );

    // Bob has 1 message that should be unread
    await waitFor(() => expect(within(screen.getByRole('group', {name: /comms/i})).getByRole('status')).toHaveTextContent('1'));
  });
});
