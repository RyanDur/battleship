import {render, screen, act, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Comms} from './Comms';
import {ConnectionProvider} from '../state/ConnectionProvider';
import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from '../state/connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import {messageReceived, sendMessage} from '../state/connectionActions';
import {selectMessages} from '../state/connectionSelectors';

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
  render(
    <ConnectionProvider store={store}>
      <Comms peerId={peerId} peerName={peerName}/>
    </ConnectionProvider>
  );
  return {store};
};

describe('Comms', () => {
  it('shows the comms panel as a complementary landmark', () => {
    setup();

    expect(screen.getByRole('complementary', {name: /communications/i})).toBeInTheDocument();
  });

  it('is expanded by default', () => {
    setup();

    expect(screen.getByRole('complementary').querySelector('details')).toHaveAttribute('open');
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

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('unread count is empty when panel is open', async () => {
    const {store} = setup('p1', 'Alice');

    await act(async () => store.dispatch(messageReceived('p1', 'Hello!')));

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('unread count increments when panel is collapsed and messages arrive', async () => {
    const user = userEvent.setup();
    const {store} = setup('p1', 'Alice');

    await user.click(screen.getByRole('complementary').querySelector('summary')!);
    await act(async () => store.dispatch(messageReceived('p1', 'Hello!')));
    await act(async () => store.dispatch(messageReceived('p1', 'Another!')));

    expect(screen.getByRole('status')).toHaveTextContent('2');
  });

  it('unread count resets when panel is expanded', async () => {
    const user = userEvent.setup();
    const {store} = setup('p1', 'Alice');

    const summary = screen.getByRole('complementary').querySelector('summary')!;
    await user.click(summary);
    await act(async () => store.dispatch(messageReceived('p1', 'Hello!')));
    await user.click(summary);

    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
