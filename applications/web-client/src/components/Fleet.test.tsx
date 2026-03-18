import {render, screen, act, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Fleet} from './Fleet';
import {ConnectionProvider} from '../state/ConnectionProvider';
import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from '../state/connectionStore';
import type {ConnectionsAction} from '../state/connections';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import {peerConnected, peerNamed, peerDisconnected, grantTrust, peerTrustUpdated, introductionReceived, peerConnectionUnstable, peerConnectionRestored, previousPeersReceived, onlinePeerLeft, onlinePeersUpdated, onlinePeerJoined, reconnectViaServer, forgetPeer, savePeerEmail} from '../state/connectionActions';
import {selectPeers, selectPendingIntroductions} from '../state/connectionSelectors';

const makeStore = () => {
  const factory = createFakePeerConnectionFactory();
  const store = createConnectionStore(
    applyMiddleware([encodingMiddleware, codecMiddleware]),
    [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
  );
  return {store};
};

const setup = () => {
  const {store} = makeStore();
  render(
    <ConnectionProvider store={store}>
      <Fleet/>
    </ConnectionProvider>
  );
  return {store};
};

describe('Fleet', () => {
  it('shows the fleet panel as a navigation landmark', () => {
    setup();

    expect(screen.getByRole('navigation', {name: /fleet/i})).toBeInTheDocument();
  });

  it('shows no sections when there are no peers', () => {
    setup();

    expect(screen.queryByRole('region', {name: /connected/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('region', {name: /online/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('region', {name: /previous/i})).not.toBeInTheDocument();
  });

  it('is expanded by default', () => {
    setup();

    expect(screen.getByRole('navigation', {name: /fleet/i}).querySelector('details')).toHaveAttribute('open');
  });

  it('summary shows connected peer count when peers are present', async () => {
    const {store} = setup();

    await act(async () => store.dispatch(peerConnected('p1')));

    expect(screen.getByRole('status')).toHaveTextContent(/1 connected/i);
  });

  it('collapsing hides peer sections', async () => {
    const user = userEvent.setup();
    const {store} = setup();
    await act(async () => store.dispatch(peerConnected('p1')));
    await act(async () => store.dispatch(peerNamed('p1', 'Alice')));

    await user.click(screen.getByText(/fleet/i, {selector: 'summary'}));

    expect(screen.getByRole('navigation', {name: /fleet/i}).querySelector('details')).not.toHaveAttribute('open');
  });

  describe('Connected', () => {
    it('shows connected peer in Connected section by name', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Alice')));

      expect(within(screen.getByRole('region', {name: /connected/i})).getByText('Alice')).toBeInTheDocument();
    });

    it('shows connected peer without name as Unknown', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));

      expect(within(screen.getByRole('region', {name: /connected/i})).getByText('Unknown')).toBeInTheDocument();
    });

    it('shows accessible trust indicator (not visible text) when peer trusts you', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerTrustUpdated('p1', true)));

      expect(screen.getByLabelText(/trusts you to introduce/i)).toBeInTheDocument();
      expect(screen.queryByText(/trusts you to introduce them/i)).not.toBeInTheDocument();
    });

    it('shows reconnecting indicator when peer connection is unstable', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Alice')));
      await act(async () => store.dispatch(peerConnectionUnstable('p1')));

      expect(within(screen.getByRole('region', {name: /connected/i})).getByText(/reconnecting/i)).toBeInTheDocument();
    });

    it('hides reconnecting indicator when peer connection is restored', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Alice')));
      await act(async () => store.dispatch(peerConnectionUnstable('p1')));
      await act(async () => store.dispatch(peerConnectionRestored('p1')));

      expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();
    });

    it('shows a trust button for an untrusted connected peer', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Alice')));

      expect(within(screen.getByRole('region', {name: /connected/i})).getByRole('button', {name: /^trust$/i})).toBeInTheDocument();
    });

    it('clicking trust grants trust', async () => {
      const user = userEvent.setup();
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Alice')));

      await user.click(screen.getByRole('button', {name: /^trust$/i}));

      expect(selectPeers(store.getState())[0].trusted).toBe(true);
    });

    it('shows revoke trust button for a trusted peer', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Alice')));
      await act(async () => store.dispatch(grantTrust('p1')));

      expect(screen.getByRole('button', {name: /revoke trust/i})).toBeInTheDocument();
    });

    it('clicking revoke trust revokes trust', async () => {
      const user = userEvent.setup();
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Alice')));
      await act(async () => store.dispatch(grantTrust('p1')));

      await user.click(screen.getByRole('button', {name: /revoke trust/i}));

      expect(selectPeers(store.getState())[0].trusted).toBe(false);
    });

    it('shows introduce button when multiple peers trust you', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Bob')));
      await act(async () => store.dispatch(peerTrustUpdated('p1', true)));
      await act(async () => store.dispatch(peerConnected('p2')));
      await act(async () => store.dispatch(peerNamed('p2', 'Carol')));
      await act(async () => store.dispatch(peerTrustUpdated('p2', true)));

      expect(screen.getAllByRole('button', {name: /^introduce$/i})).toHaveLength(2);
    });

    it('clicking introduce shows other trusting peers to select', async () => {
      const user = userEvent.setup();
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Bob')));
      await act(async () => store.dispatch(peerTrustUpdated('p1', true)));
      await act(async () => store.dispatch(peerConnected('p2')));
      await act(async () => store.dispatch(peerNamed('p2', 'Carol')));
      await act(async () => store.dispatch(peerTrustUpdated('p2', true)));

      await user.click(screen.getAllByRole('button', {name: /^introduce$/i})[0]);

      expect(screen.getByRole('button', {name: 'Carol'})).toBeInTheDocument();
    });

    it('selecting a peer to introduce dispatches and hides peer buttons', async () => {
      const user = userEvent.setup();
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Bob')));
      await act(async () => store.dispatch(peerTrustUpdated('p1', true)));
      await act(async () => store.dispatch(peerConnected('p2')));
      await act(async () => store.dispatch(peerNamed('p2', 'Carol')));
      await act(async () => store.dispatch(peerTrustUpdated('p2', true)));

      await user.click(screen.getAllByRole('button', {name: /^introduce$/i})[0]);
      await user.click(screen.getByRole('button', {name: 'Carol'}));

      expect(screen.queryByRole('button', {name: 'Carol'})).not.toBeInTheDocument();
    });

    it('clicking disconnect removes the peer', async () => {
      const user = userEvent.setup();
      const {store} = setup();

      await act(async () => store.dispatch(peerConnected('p1')));
      await act(async () => store.dispatch(peerNamed('p1', 'Alice')));

      await user.click(screen.getByRole('button', {name: /disconnect/i}));
      await act(async () => store.dispatch(peerDisconnected('p1')));

      expect(selectPeers(store.getState())).toEqual([]);
    });
  });

  describe('Online', () => {
    it('shows online peer in Online section by name', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(onlinePeersUpdated([{peerId: 'p1', name: 'Alice'}])));

      expect(within(screen.getByRole('region', {name: /online/i})).getByText('Alice')).toBeInTheDocument();
    });

    it('does not show Online section when list is empty', () => {
      setup();

      expect(screen.queryByRole('region', {name: /online/i})).not.toBeInTheDocument();
    });

    it('shows Connect button for each online peer', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(onlinePeersUpdated([{peerId: 'p1', name: 'Alice'}])));

      expect(within(screen.getByRole('region', {name: /online/i})).getByRole('button', {name: /connect/i})).toBeInTheDocument();
    });

    it('PEER_JOINED adds to online peers', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(onlinePeerJoined('p2', 'Bob')));

      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('PEER_LEFT removes from online peers', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(onlinePeersUpdated([{peerId: 'p1', name: 'Alice'}])));
      await act(async () => store.dispatch(onlinePeerLeft('p1')));

      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });
  });

  describe('Previous', () => {
    it('shows previous peer in Previous section by name', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));

      expect(within(screen.getByRole('region', {name: /previous/i})).getByText('Bob')).toBeInTheDocument();
    });

    it('does not show Previous section when list is empty', () => {
      setup();

      expect(screen.queryByRole('region', {name: /previous/i})).not.toBeInTheDocument();
    });

    it('shows offline status for offline previous peer', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));

      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });

    it('shows online status for online previous peer', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: true}])));

      expect(screen.getByText(/online/i)).toBeInTheDocument();
    });

    it('marks previous peer as offline when they leave', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: true}])));
      await act(async () => store.dispatch(onlinePeerLeft('p1')));

      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });

    it('shows Reconnect button for online previous peer', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: true}])));

      expect(screen.getByRole('button', {name: /reconnect/i})).toBeInTheDocument();
    });

    it('does not show Reconnect button for offline previous peer', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));

      expect(screen.queryByRole('button', {name: /reconnect/i})).not.toBeInTheDocument();
    });

    it('clicking Forget removes the peer row from the UI', async () => {
      const user = userEvent.setup();
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));

      await user.click(screen.getByRole('button', {name: /forget/i}));

      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });

    it('clicking Forget dispatches FORGET_PEER', async () => {
      const user = userEvent.setup();
      const factory = createFakePeerConnectionFactory();
      const dispatched: ConnectionsAction[] = [];
      const store = createConnectionStore(
        applyMiddleware([encodingMiddleware, codecMiddleware, () => (next) => (action) => { dispatched.push(action); next(action); }]),
        [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
      );
      render(<ConnectionProvider store={store}><Fleet/></ConnectionProvider>);

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));

      await user.click(screen.getByRole('button', {name: /forget/i}));

      expect(dispatched).toContainEqual(forgetPeer('p1'));
    });

    it('clicking Reconnect dispatches RECONNECT_VIA_SERVER', async () => {
      const user = userEvent.setup();
      const factory = createFakePeerConnectionFactory();
      const dispatched: ConnectionsAction[] = [];
      const store = createConnectionStore(
        applyMiddleware([encodingMiddleware, codecMiddleware, () => (next) => (action) => { dispatched.push(action); next(action); }]),
        [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
      );
      render(<ConnectionProvider store={store}><Fleet/></ConnectionProvider>);

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: true}])));

      await user.click(screen.getByRole('button', {name: /reconnect/i}));

      expect(dispatched).toContainEqual(reconnectViaServer('p1', 'Bob'));
    });

    it('shows Forget button for both online and offline previous peers', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));

      expect(screen.getByRole('button', {name: /forget/i})).toBeInTheDocument();
    });

    it('shows Invite link for offline previous peer with known email', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false, email: 'bob@example.com'}])));

      expect(screen.getByRole('link', {name: /invite/i})).toBeInTheDocument();
    });

    it('Invite link has mailto href', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false, email: 'bob@example.com'}])));

      expect(screen.getByRole('link', {name: /invite/i})).toHaveAttribute('href', 'mailto:bob@example.com');
    });

    it('does not show Invite link for offline peer without email', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));

      expect(screen.queryByRole('link', {name: /invite/i})).not.toBeInTheDocument();
    });

    it('shows email input for offline peer without email', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));

      expect(screen.getByPlaceholderText(/enter email/i)).toBeInTheDocument();
    });

    it('submitting email dispatches SAVE_PEER_EMAIL', async () => {
      const user = userEvent.setup();
      const factory = createFakePeerConnectionFactory();
      const dispatched: ConnectionsAction[] = [];
      const store = createConnectionStore(
        applyMiddleware([encodingMiddleware, codecMiddleware, () => (next) => (action) => { dispatched.push(action); next(action); }]),
        [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
      );
      render(<ConnectionProvider store={store}><Fleet/></ConnectionProvider>);

      await act(async () => store.dispatch(previousPeersReceived([{peerId: 'p1', name: 'Bob', online: false}])));
      await user.type(screen.getByPlaceholderText(/enter email/i), 'bob@example.com');
      await user.keyboard('{Enter}');

      expect(dispatched).toContainEqual(savePeerEmail('p1', 'bob@example.com'));
    });
  });

  describe('Introductions', () => {
    it('shows pending introduction with from and peer name', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

      expect(screen.getByText(/alice wants to introduce you to carol/i)).toBeInTheDocument();
    });

    it('shows accept and decline buttons for a pending introduction', async () => {
      const {store} = setup();

      await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

      expect(screen.getByRole('button', {name: /accept/i})).toBeInTheDocument();
      expect(screen.getByRole('button', {name: /decline/i})).toBeInTheDocument();
    });

    it('clicking accept removes the pending introduction', async () => {
      const user = userEvent.setup();
      const {store} = setup();

      await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

      await user.click(screen.getByRole('button', {name: /accept/i}));

      expect(selectPendingIntroductions(store.getState())).toEqual([]);
    });

    it('clicking decline removes the pending introduction', async () => {
      const user = userEvent.setup();
      const {store} = setup();

      await act(async () => store.dispatch(introductionReceived('i1', 'Alice', 'Carol')));

      await user.click(screen.getByRole('button', {name: /decline/i}));

      expect(selectPendingIntroductions(store.getState())).toEqual([]);
    });
  });
});
