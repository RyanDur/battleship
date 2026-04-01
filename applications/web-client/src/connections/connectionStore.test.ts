import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {CombinedState, CombinedAction, MiddlewareFactory, ListenerFactory} from './connectionStore';
import {combinedInitialState} from './connectionStore';
import {createOffer, joinOffer, acceptAnswerCode, peerDisconnected, connectViaServer} from '../transport/transportActions';
import {peerConnected, peerNamed, grantTrust, revokeTrust, peerTrustUpdated, introductionReceived, acceptIntroduction, declineIntroduction, introductionResolved, onlinePeersUpdated, onlinePeerJoined, onlinePeerLeft} from './connectionActions';
import {selectFlow, selectPeerConnectionHealth} from '../transport/transportSelectors';
import {selectPeers, selectPendingIntroductions, selectOnlinePeers} from './connectionSelectors';

const makeStore = (extra: MiddlewareFactory[] = []) => {
  const factory = createFakePeerConnectionFactory();
  const store = createConnectionStore(
    applyMiddleware([encodingMiddleware, codecMiddleware, ...extra]),
    [createHandlerListener({name: 'Player', createPeerConnection: factory.createPeerConnection})],
  );
  return {store, factory};
};

describe('connectionStore', () => {
  describe('createOffer', () => {
    it('transitions state to creating', () => {
      const {store} = makeStore();

      store.dispatch(createOffer('secret'));

      expect(selectFlow(store.getState())).toEqual({phase: 'creating', passphrase: 'secret'});
    });

    it('transitions to offer-ready after CREATE_OFFER', async () => {
      const {store} = makeStore();

      store.dispatch(createOffer('secret'));

      await vi.waitFor(() => expect(selectFlow(store.getState()).phase).toBe('offer-ready'));
      const flow = selectFlow(store.getState());
      if (flow.phase === 'offer-ready') {
        expect(flow.code.length).toBeGreaterThan(0);
        expect(flow.peerId).toBeTruthy();
      }
    });
  });

  describe('joinOffer', () => {
    it('transitions state to joining', () => {
      const {store} = makeStore();

      store.dispatch(joinOffer('any-code', 'secret'));

      expect(selectFlow(store.getState()).phase).toBe('joining');
    });

    it('resets to idle when code cannot be decoded', async () => {
      const {store} = makeStore();

      store.dispatch(joinOffer('invalid-code', 'wrong'));

      await vi.waitFor(() => expect(selectFlow(store.getState())).toEqual({phase: 'idle'}));
    });
  });

  describe('acceptAnswer', () => {
    it('does nothing when not in offer-ready phase', () => {
      const {store} = makeStore();

      store.dispatch(acceptAnswerCode('not-a-valid-code'));

      expect(selectFlow(store.getState())).toEqual({phase: 'idle'});
    });
  });

  describe('peer events', () => {
    it('PEER_CONNECTED adds peer', () => {
      const {store} = makeStore();

      store.dispatch(peerConnected('p1'));

      expect(selectPeers(store.getState())).toEqual([{id: 'p1'}]);
    });

    it('PEER_NAMED updates peer name', () => {
      const {store} = makeStore();

      store.dispatch(peerConnected('p1'));
      store.dispatch(peerNamed('p1', 'Alice'));

      expect(selectPeers(store.getState())).toEqual([{id: 'p1', name: 'Alice'}]);
    });

    it('PEER_DISCONNECTED removes peer', () => {
      const {store} = makeStore();

      store.dispatch(peerConnected('p1'));
      store.dispatch(peerDisconnected('p1'));

      expect(selectPeers(store.getState())).toEqual([]);
    });
  });

  describe('trust', () => {
    it('GRANT_TRUST updates peer trusted state', () => {
      const {store} = makeStore();

      store.dispatch(peerConnected('p1'));
      store.dispatch(grantTrust('p1'));

      expect(selectPeers(store.getState())).toEqual([{id: 'p1', trusted: true}]);
    });

    it('REVOKE_TRUST clears peer trusted state', () => {
      const {store} = makeStore();

      store.dispatch(peerConnected('p1'));
      store.dispatch(grantTrust('p1'));
      store.dispatch(revokeTrust('p1'));

      expect(selectPeers(store.getState())).toEqual([{id: 'p1', trusted: false}]);
    });

    it('PEER_TRUST_UPDATED event updates peer trustsMe state', () => {
      const {store} = makeStore();

      store.dispatch(peerConnected('p1'));
      store.dispatch(peerTrustUpdated('p1', true));

      expect(selectPeers(store.getState())).toEqual([{id: 'p1', trustsMe: true}]);
    });
  });

  describe('introductions', () => {
    it('ACCEPT_INTRODUCTION removes from pendingIntroductions', () => {
      const {store} = makeStore();

      store.dispatch(introductionReceived('i1', 'Alice', 'Carol'));
      store.dispatch(acceptIntroduction('i1'));

      expect(selectPendingIntroductions(store.getState())).toEqual([]);
    });

    it('DECLINE_INTRODUCTION removes from pendingIntroductions', () => {
      const {store} = makeStore();

      store.dispatch(introductionReceived('i1', 'Alice', 'Carol'));
      store.dispatch(declineIntroduction('i1'));

      expect(selectPendingIntroductions(store.getState())).toEqual([]);
    });

    it('INTRODUCTION_RECEIVED adds to pendingIntroductions', () => {
      const {store} = makeStore();

      store.dispatch(introductionReceived('i1', 'Alice', 'Carol'));

      expect(selectPendingIntroductions(store.getState())).toEqual([{introId: 'i1', from: 'Alice', peer: 'Carol'}]);
    });

    it('INTRODUCTION_RESOLVED removes from pendingIntroductions', () => {
      const {store} = makeStore();

      store.dispatch(introductionReceived('i1', 'Alice', 'Carol'));
      store.dispatch(introductionResolved('i1'));

      expect(selectPendingIntroductions(store.getState())).toEqual([]);
    });
  });

  describe('signaling', () => {
    it('ONLINE_PEERS_UPDATED action updates onlinePeers', () => {
      const {store} = makeStore();

      store.dispatch(onlinePeersUpdated([{peerId: 'p1', name: 'Alice'}]));

      expect(selectOnlinePeers(store.getState())).toEqual([{peerId: 'p1', name: 'Alice'}]);
    });

    it('ONLINE_PEER_JOINED action adds to onlinePeers', () => {
      const {store} = makeStore();

      store.dispatch(onlinePeerJoined('p1', 'Alice'));

      expect(selectOnlinePeers(store.getState())).toEqual([{peerId: 'p1', name: 'Alice'}]);
    });

    it('ONLINE_PEER_LEFT action removes from onlinePeers', () => {
      const {store} = makeStore();

      store.dispatch(onlinePeersUpdated([{peerId: 'p1', name: 'Alice'}]));
      store.dispatch(onlinePeerLeft('p1'));

      expect(selectOnlinePeers(store.getState())).toEqual([]);
    });
  });

  describe('ICE restart', () => {
    const connectViaServerAndGetOfferSdp = async (store: ReturnType<typeof makeStore>['store']) => {
      const dispatched: CombinedAction[] = [];
      store.dispatch = ((original) => (action: CombinedAction) => {
        dispatched.push(action);
        return original(action);
      })(store.dispatch);

      store.dispatch(connectViaServer('bob-sig', 'Bob'));
      await vi.waitFor(() => expect(dispatched).toContainEqual(expect.objectContaining({type: 'RELAY_OFFER'})));
      return (dispatched.find(a => a.type === 'RELAY_OFFER') as {sdp: string}).sdp;
    };

    it('ICE disconnect marks peer as unstable in store state', async () => {
      const {store, factory} = makeStore();

      const offerSdp = await connectViaServerAndGetOfferSdp(store);
      factory.simulateIceStateChange(offerSdp, 'disconnected');

      await vi.waitFor(() =>
        expect(Object.values(selectPeerConnectionHealth(store.getState()))).toContain('unstable')
      );
    });

    it('ICE recovery marks peer as stable in store state', async () => {
      const {store, factory} = makeStore();

      const offerSdp = await connectViaServerAndGetOfferSdp(store);
      factory.simulateIceStateChange(offerSdp, 'disconnected');
      await vi.waitFor(() => expect(Object.values(selectPeerConnectionHealth(store.getState()))).toContain('unstable'));

      factory.simulateIceStateChange(offerSdp, 'connected');

      await vi.waitFor(() =>
        expect(Object.values(selectPeerConnectionHealth(store.getState()))).toContain('stable')
      );
    });

    it('ICE disconnect triggers RELAY_ICE_RESTART dispatch', async () => {
      const dispatched: CombinedAction[] = [];
      const {store, factory} = makeStore([() => (next) => (action) => { dispatched.push(action); next(action); }]);

      const offerSdp = await connectViaServerAndGetOfferSdp(store);
      factory.simulateIceStateChange(offerSdp, 'disconnected');

      await vi.waitFor(() =>
        expect(dispatched).toContainEqual(expect.objectContaining({type: 'RELAY_ICE_RESTART', targetPeerId: 'bob-sig'}))
      );
    });
  });

  describe('applyMiddleware (standalone)', () => {
    it('fans out action to all middleware via next chain', () => {
      const received1: CombinedAction[] = [];
      const received2: CombinedAction[] = [];
      const noop = () => {};
      const composed = applyMiddleware([
        () => (next) => (action) => { received1.push(action); next(action); },
        () => (next) => (action) => { received2.push(action); next(action); },
      ]);
      const action = createOffer('secret');
      const dispatch = composed({dispatch: noop, getState: () => combinedInitialState})(noop);

      dispatch(action);

      expect(received1).toContainEqual(action);
      expect(received2).toContainEqual(action);
    });

    it('middleware runs before baseDispatch (next)', () => {
      const order: string[] = [];
      const noop = () => {};
      const composed = applyMiddleware([
        () => (next) => (action) => { order.push('middleware'); next(action); },
      ]);
      const baseDispatch = () => order.push('base');
      const dispatch = composed({dispatch: noop, getState: () => combinedInitialState})(baseDispatch);

      dispatch(createOffer('secret'));

      expect(order).toEqual(['middleware', 'base']);
    });

    it('is a no-op for an empty list', () => {
      const noop = () => {};
      const composed = applyMiddleware([]);
      const dispatch = composed({dispatch: noop, getState: () => combinedInitialState})(noop);
      expect(() => dispatch(createOffer('secret'))).not.toThrow();
    });
  });

  describe('middleware', () => {
    it('receives every dispatched action', () => {
      const actions: CombinedAction[] = [];
      const {store} = makeStore([() => (next) => (action) => { actions.push(action); next(action); }]);

      store.dispatch(createOffer('secret'));

      expect(actions).toContainEqual(createOffer('secret'));
    });
  });

  describe('subscribe', () => {
    it('notifies listener on state change', () => {
      const {store} = makeStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch(createOffer('secret'));

      expect(listener).toHaveBeenCalled();
    });

    it('unsubscribe stops notifications', () => {
      const {store} = makeStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.dispatch(createOffer('secret'));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('addListener', () => {
    it('receives action and prevState and state after dispatch', () => {
      const {store} = makeStore();
      const received: Array<{action: CombinedAction; prevState: CombinedState; state: CombinedState}> = [];
      store.addListener((action, {prevState, state}) => received.push({action, prevState, state}));

      store.dispatch(createOffer('secret'));

      const entry = received.find(r => r.action.type === 'CREATE_OFFER');
      expect(entry).toBeDefined();
      expect(entry!.prevState.flow.phase).toBe('idle');
      expect(entry!.state.flow.phase).toBe('creating');
    });

    it('receives post-reducer state', () => {
      const {store} = makeStore();
      let seenState: CombinedState | undefined;
      store.addListener((_action, {state}) => { seenState = state; });

      store.dispatch(peerConnected('p1'));

      expect(seenState?.peers).toContainEqual({id: 'p1'});
    });

    it('can dispatch from listener and the action enters the full chain', () => {
      const {store} = makeStore();
      const seen: string[] = [];
      store.addListener((action, {dispatch}) => {
        seen.push(action.type);
        if (action.type === 'PEER_CONNECTED') dispatch(peerNamed(action.peerId, 'Alice'));
      });

      store.dispatch(peerConnected('p1'));

      expect(seen).toContain('PEER_CONNECTED');
      expect(seen).toContain('PEER_NAMED');
      expect(selectPeers(store.getState())).toContainEqual({id: 'p1', name: 'Alice'});
    });

    it('unsubscribe stops listener from receiving actions', () => {
      const {store} = makeStore();
      const received: CombinedAction[] = [];
      const unsubscribe = store.addListener((action) => received.push(action));

      unsubscribe();
      store.dispatch(createOffer('secret'));

      expect(received).toHaveLength(0);
    });
  });

  describe('listenerFactories', () => {
    it('listener factory receives dispatch and getState and its returned listener fires on every action', () => {
      const received: CombinedAction[] = [];
      const factory: ListenerFactory = ({dispatch: _dispatch, getState: _getState}) =>
        (action) => received.push(action);

      const store = createConnectionStore(undefined, [factory]);
      store.dispatch(createOffer('secret'));

      expect(received).toContainEqual(createOffer('secret'));
    });

    it('listener factory receives prevState and state on each action', () => {
      const entries: Array<{prevPhase: string; phase: string}> = [];
      const factory: ListenerFactory = () =>
        (_action, {prevState, state}) =>
          entries.push({prevPhase: prevState.flow.phase, phase: state.flow.phase});

      const store = createConnectionStore(undefined, [factory]);
      store.dispatch(createOffer('secret'));

      const entry = entries.find(e => e.phase === 'creating');
      expect(entry?.prevPhase).toBe('idle');
    });
  });
});
