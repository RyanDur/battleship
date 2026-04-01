import {render, screen, within, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Fleet} from './Fleet';
import {Alerts} from './Alerts';
import {StoreProvider} from './StoreProvider';
import {createAppStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './store';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {AppStore, MiddlewareFactory} from './store';
import type {TransportFlow} from '../transport/transport';
import {serverOfferReceived, serverAnswerReceived, reconnectViaServer, createOffer, joinOffer, acceptAnswerCode} from '../transport/transportActions';
import {previousPeersReceived, onlinePeersUpdated} from './connectionActions';
import {selectFlow} from '../transport/transportSelectors';
import {selectPeers, selectPreviousPeers} from './connectionSelectors';
import {GameProvider} from '../game/GameProvider';
import {createGameStore} from '../game/gameStore';

describe('Fleet integration', () => {
  it('reconnecting to a previous peer removes them from previous peers list', async () => {
    const factory = createFakePeerConnectionFactory();

    const alice: {store?: AppStore} = {};
    const bob: {store?: AppStore} = {};

    const makeRelayMiddleware = (myName: string, mySignalingPeerId: string, getOther: () => AppStore): MiddlewareFactory =>
      (_deps) => (next) => (action) => {
        if (action.type === 'RELAY_OFFER') {
          getOther().dispatch(serverOfferReceived(mySignalingPeerId, myName, action.sdp));
        } else if (action.type === 'RELAY_ANSWER') {
          getOther().dispatch(serverAnswerReceived(mySignalingPeerId, action.sdp));
        }
        next(action);
      };

    alice.store = createAppStore(
      applyMiddleware([encodingMiddleware, codecMiddleware, makeRelayMiddleware('Alice', 'alice-sig', () => bob.store!)]),
      [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection})],
    );

    bob.store = createAppStore(
      applyMiddleware([encodingMiddleware, codecMiddleware, makeRelayMiddleware('Bob', 'bob-sig', () => alice.store!)]),
      [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection})],
    );

    const aliceStore = alice.store;

    // Alice has Bob as a previous peer (e.g. from a prior session)
    await act(async () => aliceStore.dispatch(previousPeersReceived([{peerId: 'bob-sig', name: 'Bob', online: true}])));

    expect(selectPreviousPeers(aliceStore.getState())).toHaveLength(1);

    // Alice reconnects to Bob
    await act(async () => aliceStore.dispatch(reconnectViaServer('bob-sig', 'Bob')));

    await waitFor(() => {
      expect(selectPeers(aliceStore.getState())).toHaveLength(1);
      expect(selectPreviousPeers(aliceStore.getState())).toHaveLength(0);
    });
  });

  it('Alice connects to Bob via signaling relay', async () => {
    const factory = createFakePeerConnectionFactory();
    const user = userEvent.setup();

    const alice: {store?: AppStore} = {};
    const bob: {store?: AppStore} = {};

    const makeRelayMiddleware = (myName: string, mySignalingPeerId: string, getOther: () => AppStore): MiddlewareFactory =>
      (_deps) => (next) => (action) => {
        if (action.type === 'RELAY_OFFER') {
          getOther().dispatch(serverOfferReceived(mySignalingPeerId, myName, action.sdp));
        } else if (action.type === 'RELAY_ANSWER') {
          getOther().dispatch(serverAnswerReceived(mySignalingPeerId, action.sdp));
        }
        next(action);
      };

    alice.store = createAppStore(
      applyMiddleware([encodingMiddleware, codecMiddleware, makeRelayMiddleware('Alice', 'alice-sig', () => bob.store!)]),
      [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection})],
    );

    bob.store = createAppStore(
      applyMiddleware([encodingMiddleware, codecMiddleware, makeRelayMiddleware('Bob', 'bob-sig', () => alice.store!)]),
      [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection})],
    );

    const aliceStore = alice.store;
    const bobStore = bob.store;

    render(
      <div>
        <div data-testid="alice">
          <StoreProvider store={aliceStore}><GameProvider store={createGameStore()}><Fleet /></GameProvider></StoreProvider>
        </div>
        <div data-testid="bob">
          <StoreProvider store={bobStore}><GameProvider store={createGameStore()}><Fleet /></GameProvider></StoreProvider>
        </div>
      </div>
    );

    const aliceUI = within(screen.getByTestId('alice'));

    await act(async () => aliceStore.dispatch(onlinePeersUpdated([{peerId: 'bob-sig', name: 'Bob'}])));

    await user.click(aliceUI.getByRole('button', {name: /connect/i}));

    await waitFor(() => {
      expect(selectPeers(aliceStore.getState())).toHaveLength(1);
      expect(selectPeers(bobStore.getState())).toHaveLength(1);
    });
  });

  it('Bob and Carol connect directly after Alice introduces them', async () => {
    const factory = createFakePeerConnectionFactory();
    const user = userEvent.setup();

    const makeStore = (name: string) =>
      createAppStore(
        applyMiddleware([encodingMiddleware, codecMiddleware]),
        [createHandlerListener({name, createPeerConnection: factory.createPeerConnection})],
      );

    const aliceStore = makeStore('Alice');
    const bobStore = makeStore('Bob');
    const carolStore = makeStore('Carol');

    render(
      <div>
        <div data-testid="alice">
          <StoreProvider store={aliceStore}><GameProvider store={createGameStore()}><Fleet /><Alerts /></GameProvider></StoreProvider>
        </div>
        <div data-testid="bob">
          <StoreProvider store={bobStore}><GameProvider store={createGameStore()}><Fleet /><Alerts /></GameProvider></StoreProvider>
        </div>
        <div data-testid="carol">
          <StoreProvider store={carolStore}><GameProvider store={createGameStore()}><Fleet /><Alerts /></GameProvider></StoreProvider>
        </div>
      </div>
    );

    const aliceUI = within(screen.getByTestId('alice'));
    const bobUI = within(screen.getByTestId('bob'));
    const carolUI = within(screen.getByTestId('carol'));

    const connectStores = async (offerer: AppStore, answerer: AppStore) => {
      const priorOffererPeers = selectPeers(offerer.getState()).length;
      const priorAnswererPeers = selectPeers(answerer.getState()).length;

      await act(async () => { offerer.dispatch(createOffer('pass')); });
      await waitFor(() => expect(selectFlow(offerer.getState()).phase).toBe('offer-ready'));
      const offerFlow = selectFlow(offerer.getState()) as Extract<TransportFlow, {phase: 'offer-ready'}>;

      await act(async () => { answerer.dispatch(joinOffer(offerFlow.code, 'pass')); });
      await waitFor(() => expect(selectFlow(answerer.getState()).phase).toBe('answer-ready'));
      const answerFlow = selectFlow(answerer.getState()) as Extract<TransportFlow, {phase: 'answer-ready'}>;

      await act(async () => { offerer.dispatch(acceptAnswerCode(answerFlow.code)); });
      await waitFor(() => {
        expect(selectPeers(offerer.getState()).length).toBeGreaterThan(priorOffererPeers);
        expect(selectPeers(answerer.getState()).length).toBeGreaterThan(priorAnswererPeers);
      });
    };

    // Connect Alice↔Bob and Alice↔Carol via the store API
    await connectStores(aliceStore, bobStore);
    await connectStores(aliceStore, carolStore);

    // Wait for Alice to know both names before introducing
    await waitFor(() => expect(selectPeers(aliceStore.getState()).filter(p => p.name)).toHaveLength(2));

    // Bob and Carol each grant trust to Alice so she can introduce them
    await user.click(bobUI.getByRole('button', {name: /^trust$/i}));
    await user.click(carolUI.getByRole('button', {name: /^trust$/i}));

    // Wait for Alice's UI to show Introduce buttons (both peers now trust her)
    await waitFor(() =>
      expect(aliceUI.getAllByRole('button', {name: /introduce/i})).toHaveLength(2)
    );

    // Alice clicks Introduce on Bob's row, then selects Carol from the peer list
    await user.click(aliceUI.getAllByRole('button', {name: /introduce/i})[0]);
    await user.click(aliceUI.getByRole('button', {name: /introduce to carol/i}));

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
      expect(selectPeers(bobStore.getState())).toHaveLength(2);
      expect(selectPeers(carolStore.getState())).toHaveLength(2);
    });
  });
});
