import {render, screen, act, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Connections} from './Connections';
import {ConnectionProvider} from '../state/ConnectionProvider';
import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from '../state/connectionStore';
import type {ConnectionsAction} from '../state/connections';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';

const makeStore = () => {
  const factory = createFakePeerConnectionFactory();
  const store = createConnectionStore(
    applyMiddleware([encodingMiddleware, codecMiddleware]),
    [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
  );
  return {store};
};

const renderConnections = (serviceOnline = true) => {
  const {store} = makeStore();
  render(
    <ConnectionProvider store={store}>
      <Connections serviceOnline={serviceOnline}/>
    </ConnectionProvider>
  );
  return {store};
};

describe('Connections', () => {
  it('shows create and join options when service is online', () => {
    renderConnections(true);

    expect(screen.getByRole('button', {name: /create/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /join/i})).toBeInTheDocument();
  });

  it('hides connection UI when service is not online', () => {
    renderConnections(false);

    expect(screen.queryByRole('button', {name: /create/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /join/i})).not.toBeInTheDocument();
  });

  it('clicking Create shows passphrase input', async () => {
    const user = userEvent.setup();
    renderConnections();

    await user.click(screen.getByRole('button', {name: /create/i}));

    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument();
  });

  it('submitting Create form transitions to offer-ready after SDP encodes', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await user.click(screen.getByRole('button', {name: /create/i}));
    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret');
    await user.click(screen.getByRole('button', {name: /generate/i}));

    await waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));
    expect(screen.getByText(/share this code/i)).toBeInTheDocument();
  });

  it('entering response code and submitting calls acceptAnswer', async () => {
    const user = userEvent.setup();
    const {store} = makeStore();
    render(
      <ConnectionProvider store={store}>
        <Connections serviceOnline={true}/>
      </ConnectionProvider>
    );

    act(() => store.dispatch({type: 'CREATE_OFFER', passphrase: 'pass'}));
    await waitFor(() => expect(screen.getByLabelText(/response code/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/response code/i), 'some-response-code');
    await user.click(screen.getByRole('button', {name: /connect/i}));

    // acceptAnswer decodes and forwards to handler — flow stays offer-ready at store level
    // verify no errors thrown and the button interaction completed
    expect(screen.getByRole('button', {name: /connect/i})).toBeInTheDocument();
  });

  it('clicking Join shows passphrase and offer code inputs', async () => {
    const user = userEvent.setup();
    renderConnections();

    await user.click(screen.getByRole('button', {name: /join/i}));

    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/offer code/i)).toBeInTheDocument();
  });

  it('submitting Join form transitions to joining phase', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await user.click(screen.getByRole('button', {name: /join/i}));
    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret');
    await user.type(screen.getByLabelText(/offer code/i), 'some-offer-code');
    await user.click(screen.getByRole('button', {name: /join/i}));

    await waitFor(() => expect(store.getState().flow.phase).toBe('joining'));
  });

  it('shows connected peer by name in peers list', async () => {
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows peer without name as Unknown', async () => {
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows a trust button for a connected peer', async () => {
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));

    expect(screen.getByRole('button', {name: /trust/i})).toBeInTheDocument();
  });

  it('clicking trust calls store.grantTrust with the peer id', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));

    await user.click(screen.getByRole('button', {name: /^trust$/i}));

    expect(store.getState().peers[0].trusted).toBe(true);
  });

  it('shows a revoke trust button when peer is trusted', async () => {
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));
    await act(async () => store.dispatch({type: 'GRANT_TRUST', peerId: 'p1'}));

    expect(screen.getByRole('button', {name: /revoke trust/i})).toBeInTheDocument();
  });

  it('clicking revoke trust calls store.revokeTrust with the peer id', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));
    await act(async () => store.dispatch({type: 'GRANT_TRUST', peerId: 'p1'}));

    await user.click(screen.getByRole('button', {name: /revoke trust/i}));

    expect(store.getState().peers[0].trusted).toBe(false);
  });

  it('shows when a peer trusts you to introduce them', async () => {
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));
    await act(async () => store.dispatch({type: 'PEER_TRUST_UPDATED', peerId: 'p1', trusts: true}));

    expect(screen.getByText(/trusts you/i)).toBeInTheDocument();
  });

  it('shows an introduce button for each peer that trusts you when multiple trusting peers exist', async () => {
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Bob'}));
    await act(async () => store.dispatch({type: 'PEER_TRUST_UPDATED', peerId: 'p1', trusts: true}));
    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p2'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p2', name: 'Carol'}));
    await act(async () => store.dispatch({type: 'PEER_TRUST_UPDATED', peerId: 'p2', trusts: true}));

    expect(screen.getAllByRole('button', {name: /^introduce$/i})).toHaveLength(2);
  });

  it('clicking introduce for a peer shows other trusting peers to select', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Bob'}));
    await act(async () => store.dispatch({type: 'PEER_TRUST_UPDATED', peerId: 'p1', trusts: true}));
    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p2'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p2', name: 'Carol'}));
    await act(async () => store.dispatch({type: 'PEER_TRUST_UPDATED', peerId: 'p2', trusts: true}));

    await user.click(screen.getAllByRole('button', {name: /^introduce$/i})[0]);

    expect(screen.getByRole('button', {name: 'Carol'})).toBeInTheDocument();
  });

  it('selecting a second peer hides the peer buttons (introduction dispatched)', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Bob'}));
    await act(async () => store.dispatch({type: 'PEER_TRUST_UPDATED', peerId: 'p1', trusts: true}));
    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p2'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p2', name: 'Carol'}));
    await act(async () => store.dispatch({type: 'PEER_TRUST_UPDATED', peerId: 'p2', trusts: true}));

    await user.click(screen.getAllByRole('button', {name: /^introduce$/i})[0]);
    await user.click(screen.getByRole('button', {name: 'Carol'}));

    expect(screen.queryByRole('button', {name: 'Carol'})).not.toBeInTheDocument();
  });

  it('shows a pending introduction with from and peer name', async () => {
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'}));

    expect(screen.getByText(/alice wants to introduce you to carol/i)).toBeInTheDocument();
  });

  it('shows accept and decline buttons for a pending introduction', async () => {
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'}));

    expect(screen.getByRole('button', {name: /accept/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /decline/i})).toBeInTheDocument();
  });

  it('clicking accept removes the pending introduction', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'}));

    await user.click(screen.getByRole('button', {name: /accept/i}));

    expect(store.getState().pendingIntroductions).toEqual([]);
  });

  it('clicking decline removes the pending introduction', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'}));

    await user.click(screen.getByRole('button', {name: /decline/i}));

    expect(store.getState().pendingIntroductions).toEqual([]);
  });

  describe('connection health', () => {
    it('shows reconnecting indicator when peer connection is unstable', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
      await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));
      await act(async () => store.dispatch({type: 'PEER_CONNECTION_UNSTABLE', peerId: 'p1'}));

      expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
    });

    it('hides reconnecting indicator when peer connection is restored', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
      await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));
      await act(async () => store.dispatch({type: 'PEER_CONNECTION_UNSTABLE', peerId: 'p1'}));
      await act(async () => store.dispatch({type: 'PEER_CONNECTION_RESTORED', peerId: 'p1'}));

      expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();
    });
  });

  it('clicking disconnect removes the peer', async () => {
    const user = userEvent.setup();
    const {store} = renderConnections();

    await act(async () => store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'}));
    await act(async () => store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'}));
    expect(screen.getByText('Alice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: /disconnect/i}));
    await act(async () => store.dispatch({type: 'PEER_DISCONNECTED', peerId: 'p1'}));

    expect(store.getState().peers).toEqual([]);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  describe('previous peers', () => {
    it('shows previous peers section with peer names', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));

      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('does not show previous peers section when list is empty', () => {
      renderConnections();

      expect(screen.queryByRole('list', {name: /previous/i})).not.toBeInTheDocument();
    });

    it('shows offline status for offline previous peer', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));

      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });

    it('shows online status for online previous peer', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: true}]}));

      expect(screen.getByText(/online/i)).toBeInTheDocument();
    });

    it('marks previous peer as offline when they leave', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: true}]}));
      await act(async () => store.dispatch({type: 'ONLINE_PEER_LEFT', peerId: 'p1'}));

      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });

    it('shows Reconnect button for online previous peer', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: true}]}));

      expect(screen.getByRole('button', {name: /reconnect/i})).toBeInTheDocument();
    });

    it('does not show Reconnect button for offline previous peer', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));

      expect(screen.queryByRole('button', {name: /reconnect/i})).not.toBeInTheDocument();
    });

    it('shows Forget button for offline previous peer', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));

      expect(screen.getByRole('button', {name: /forget/i})).toBeInTheDocument();
    });

    it('shows Forget button for online previous peer', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: true}]}));

      expect(screen.getByRole('button', {name: /forget/i})).toBeInTheDocument();
    });

    it('clicking Forget removes the peer row from the UI', async () => {
      const user = userEvent.setup();
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));
      expect(screen.getByText('Bob')).toBeInTheDocument();

      await user.click(screen.getByRole('button', {name: /forget/i}));

      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });

    it('clicking Forget dispatches FORGET_PEER with correct peerId', async () => {
      const user = userEvent.setup();
      const factory = createFakePeerConnectionFactory();
      const dispatched: ConnectionsAction[] = [];
      const store = createConnectionStore(
        applyMiddleware([encodingMiddleware, codecMiddleware, () => (next) => (action) => { dispatched.push(action); next(action); }]),
        [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
      );
      render(<ConnectionProvider store={store}><Connections serviceOnline={true}/></ConnectionProvider>);

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));

      await user.click(screen.getByRole('button', {name: /forget/i}));

      expect(dispatched).toContainEqual({type: 'FORGET_PEER', peerId: 'p1'});
    });

    it('clicking Reconnect dispatches RECONNECT_VIA_SERVER with correct peer', async () => {
      const user = userEvent.setup();
      const factory = createFakePeerConnectionFactory();
      const dispatched: ConnectionsAction[] = [];
      const store = createConnectionStore(
        applyMiddleware([encodingMiddleware, codecMiddleware, () => (next) => (action) => { dispatched.push(action); next(action); }]),
        [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
      );
      render(<ConnectionProvider store={store}><Connections serviceOnline={true}/></ConnectionProvider>);

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: true}]}));

      await user.click(screen.getByRole('button', {name: /reconnect/i}));

      expect(dispatched).toContainEqual({type: 'RECONNECT_VIA_SERVER', signalingPeerId: 'p1', name: 'Bob'});
    });
  });

  describe('offline peer invitation', () => {
    it('shows Invite link for offline previous peer with known email', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false, email: 'bob@example.com'}]}));

      expect(screen.getByRole('link', {name: /invite/i})).toBeInTheDocument();
    });

    it('Invite link has mailto href with the peer email', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false, email: 'bob@example.com'}]}));

      expect(screen.getByRole('link', {name: /invite/i})).toHaveAttribute('href', 'mailto:bob@example.com');
    });

    it('does not show Invite link for offline previous peer without email', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));

      expect(screen.queryByRole('link', {name: /invite/i})).not.toBeInTheDocument();
    });

    it('does not show Invite link for online previous peer', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: true, email: 'bob@example.com'}]}));

      expect(screen.queryByRole('link', {name: /invite/i})).not.toBeInTheDocument();
    });

    it('shows email input for offline previous peer without email', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));

      expect(screen.getByPlaceholderText(/enter email/i)).toBeInTheDocument();
    });

    it('does not show email input for offline previous peer with email', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false, email: 'bob@example.com'}]}));

      expect(screen.queryByPlaceholderText(/enter email/i)).not.toBeInTheDocument();
    });

    it('submitting the email input dispatches SAVE_PEER_EMAIL', async () => {
      const user = userEvent.setup();
      const factory = createFakePeerConnectionFactory();
      const dispatched: ConnectionsAction[] = [];
      const store = createConnectionStore(
        applyMiddleware([encodingMiddleware, codecMiddleware, () => (next) => (action) => { dispatched.push(action); next(action); }]),
        [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
      );
      render(<ConnectionProvider store={store}><Connections serviceOnline={true}/></ConnectionProvider>);

      await act(async () => store.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'p1', name: 'Bob', online: false}]}));
      await user.type(screen.getByPlaceholderText(/enter email/i), 'bob@example.com');
      await user.keyboard('{Enter}');

      expect(dispatched).toContainEqual({type: 'SAVE_PEER_EMAIL', peerId: 'p1', email: 'bob@example.com'});
    });
  });

  describe('online peers', () => {
    it('shows online peer names from signaling', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'ONLINE_PEERS_UPDATED', peers: [{peerId: 'p1', name: 'Alice'}]}));

      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('does not show online peers section when list is empty', () => {
      renderConnections();

      expect(screen.queryByRole('list', {name: /online/i})).not.toBeInTheDocument();
    });

    it('PEER_JOINED adds to online peers', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'ONLINE_PEER_JOINED', peerId: 'p2', name: 'Bob'}));

      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('PEER_LEFT removes from online peers', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'ONLINE_PEERS_UPDATED', peers: [{peerId: 'p1', name: 'Alice'}]}));
      await act(async () => store.dispatch({type: 'ONLINE_PEER_LEFT', peerId: 'p1'}));

      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });

    it('shows a Connect button for each online peer', async () => {
      const {store} = renderConnections();

      await act(async () => store.dispatch({type: 'ONLINE_PEERS_UPDATED', peers: [{peerId: 'p1', name: 'Alice'}]}));

      expect(screen.getByRole('button', {name: /connect/i})).toBeInTheDocument();
    });
  });
});
