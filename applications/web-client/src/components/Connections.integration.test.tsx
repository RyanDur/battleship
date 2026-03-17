import {render, screen, within, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Connections} from './Connections';
import {ConnectionProvider} from '../state/ConnectionProvider';
import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from '../state/connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {ConnectionStore, MiddlewareFactory} from '../state/connectionStore';
import type {ConnectionFlow} from '../state/connections';

describe('Connections integration', () => {
  it('reconnecting to a previous peer removes them from previous peers list', async () => {
    const factory = createFakePeerConnectionFactory();

    const alice: {store?: ConnectionStore} = {};
    const bob: {store?: ConnectionStore} = {};

    const makeRelayMiddleware = (myName: string, mySignalingPeerId: string, getOther: () => ConnectionStore): MiddlewareFactory =>
      (_deps) => (next) => (action) => {
        if (action.type === 'RELAY_OFFER') {
          getOther().dispatch({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: mySignalingPeerId, name: myName, sdp: action.sdp});
        } else if (action.type === 'RELAY_ANSWER') {
          getOther().dispatch({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: mySignalingPeerId, sdp: action.sdp});
        }
        next(action);
      };

    alice.store = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware, makeRelayMiddleware('Alice', 'alice-sig', () => bob.store!)]),
      [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection})],
    );

    bob.store = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware, makeRelayMiddleware('Bob', 'bob-sig', () => alice.store!)]),
      [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection})],
    );

    const aliceStore = alice.store;

    // Alice has Bob as a previous peer (e.g. from a prior session)
    await act(async () => aliceStore.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'bob-sig', name: 'Bob', online: true}]}));

    expect(aliceStore.getState().previousPeers).toHaveLength(1);

    // Alice reconnects to Bob
    await act(async () => aliceStore.dispatch({type: 'RECONNECT_VIA_SERVER', signalingPeerId: 'bob-sig', name: 'Bob'}));

    await waitFor(() => {
      expect(aliceStore.getState().peers).toHaveLength(1);
      expect(aliceStore.getState().previousPeers).toHaveLength(0);
    });
  });

  it('Alice connects to Bob via signaling relay', async () => {
    const factory = createFakePeerConnectionFactory();
    const user = userEvent.setup();

    const alice: {store?: ConnectionStore} = {};
    const bob: {store?: ConnectionStore} = {};

    const makeRelayMiddleware = (myName: string, mySignalingPeerId: string, getOther: () => ConnectionStore): MiddlewareFactory =>
      (_deps) => (next) => (action) => {
        if (action.type === 'RELAY_OFFER') {
          getOther().dispatch({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: mySignalingPeerId, name: myName, sdp: action.sdp});
        } else if (action.type === 'RELAY_ANSWER') {
          getOther().dispatch({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: mySignalingPeerId, sdp: action.sdp});
        }
        next(action);
      };

    alice.store = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware, makeRelayMiddleware('Alice', 'alice-sig', () => bob.store!)]),
      [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection})],
    );

    bob.store = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware, makeRelayMiddleware('Bob', 'bob-sig', () => alice.store!)]),
      [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection})],
    );

    const aliceStore = alice.store;
    const bobStore = bob.store;

    render(
      <div>
        <div data-testid="alice">
          <ConnectionProvider store={aliceStore}><Connections serviceOnline={true} /></ConnectionProvider>
        </div>
        <div data-testid="bob">
          <ConnectionProvider store={bobStore}><Connections serviceOnline={true} /></ConnectionProvider>
        </div>
      </div>
    );

    const aliceUI = within(screen.getByTestId('alice'));

    await act(async () => aliceStore.dispatch({type: 'ONLINE_PEERS_UPDATED', peers: [{peerId: 'bob-sig', name: 'Bob'}]}));

    await user.click(aliceUI.getByRole('button', {name: /connect/i}));

    await waitFor(() => {
      expect(aliceStore.getState().peers).toHaveLength(1);
      expect(bobStore.getState().peers).toHaveLength(1);
    });
  });

  it('Bob and Carol connect directly after Alice introduces them', async () => {
    const factory = createFakePeerConnectionFactory();
    const user = userEvent.setup();

    const makeStore = (name: string) =>
      createConnectionStore(
        applyMiddleware([encodingMiddleware, codecMiddleware]),
        [createHandlerListener({name, createPeerConnection: factory.createPeerConnection})],
      );

    const aliceStore = makeStore('Alice');
    const bobStore = makeStore('Bob');
    const carolStore = makeStore('Carol');

    render(
      <div>
        <div data-testid="alice">
          <ConnectionProvider store={aliceStore}><Connections serviceOnline={true} /></ConnectionProvider>
        </div>
        <div data-testid="bob">
          <ConnectionProvider store={bobStore}><Connections serviceOnline={true} /></ConnectionProvider>
        </div>
        <div data-testid="carol">
          <ConnectionProvider store={carolStore}><Connections serviceOnline={true} /></ConnectionProvider>
        </div>
      </div>
    );

    const aliceUI = within(screen.getByTestId('alice'));
    const bobUI = within(screen.getByTestId('bob'));
    const carolUI = within(screen.getByTestId('carol'));

    const connectStores = async (offerer: ConnectionStore, answerer: ConnectionStore) => {
      const priorOffererPeers = offerer.getState().peers.length;
      const priorAnswererPeers = answerer.getState().peers.length;

      await act(async () => { offerer.dispatch({type: 'CREATE_OFFER', passphrase: 'pass'}); });
      await waitFor(() => expect(offerer.getState().flow.phase).toBe('offer-ready'));
      const offerFlow = offerer.getState().flow as Extract<ConnectionFlow, {phase: 'offer-ready'}>;

      await act(async () => { answerer.dispatch({type: 'JOIN_OFFER', code: offerFlow.code, passphrase: 'pass'}); });
      await waitFor(() => expect(answerer.getState().flow.phase).toBe('answer-ready'));
      const answerFlow = answerer.getState().flow as Extract<ConnectionFlow, {phase: 'answer-ready'}>;

      await act(async () => { offerer.dispatch({type: 'ACCEPT_ANSWER_CODE', responseCode: answerFlow.code}); });
      await waitFor(() => {
        expect(offerer.getState().peers.length).toBeGreaterThan(priorOffererPeers);
        expect(answerer.getState().peers.length).toBeGreaterThan(priorAnswererPeers);
      });
    };

    // Connect Alice↔Bob and Alice↔Carol via the store API
    await connectStores(aliceStore, bobStore);
    await connectStores(aliceStore, carolStore);

    // Wait for Alice to know both names before introducing
    await waitFor(() => expect(aliceStore.getState().peers.filter(p => p.name)).toHaveLength(2));

    // Bob and Carol each grant trust to Alice so she can introduce them
    await user.click(bobUI.getByRole('button', {name: /^trust$/i}));
    await user.click(carolUI.getByRole('button', {name: /^trust$/i}));

    // Wait for Alice's UI to show Introduce buttons (both peers now trust her)
    await waitFor(() =>
      expect(aliceUI.getAllByRole('button', {name: /introduce/i})).toHaveLength(2)
    );

    // Alice clicks Introduce on Bob's row, then selects Carol from the peer list
    await user.click(aliceUI.getAllByRole('button', {name: /introduce/i})[0]);
    await user.click(aliceUI.getByRole('button', {name: /carol/i}));

    // Bob and Carol receive the introduction
    await waitFor(() => {
      expect(bobUI.getByText(/wants to introduce you to/i)).toBeInTheDocument();
      expect(carolUI.getByText(/wants to introduce you to/i)).toBeInTheDocument();
    });

    // Both accept
    await user.click(bobUI.getByRole('button', {name: /accept/i}));
    await user.click(carolUI.getByRole('button', {name: /accept/i}));

    // Bob and Carol should now each see two peers: Alice and the newly connected peer
    await waitFor(() => {
      expect(bobStore.getState().peers).toHaveLength(2);
      expect(carolStore.getState().peers).toHaveLength(2);
    });
  });
});
