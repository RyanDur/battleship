import {createConnectionStore, createHandlerMiddleware, encodingMiddleware, codecMiddleware, applyMiddleware} from './connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {ConnectionsAction, ConnectionsState} from './connections';
import type {MiddlewareFactory} from './connectionStore';

const makeStore = (extra: MiddlewareFactory[] = []) => {
  const factory = createFakePeerConnectionFactory();
  const store = createConnectionStore(applyMiddleware([
    createHandlerMiddleware({name: 'Player', createPeerConnection: factory.createPeerConnection}),
    encodingMiddleware,
    codecMiddleware,
    ...extra,
  ]));
  return {store, factory};
};

describe('connectionStore', () => {
  describe('createOffer', () => {
    it('transitions state to creating', () => {
      const {store} = makeStore();

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(store.getState().flow).toEqual({phase: 'creating', passphrase: 'secret'});
    });

    it('transitions to offer-ready after CREATE_OFFER', async () => {
      const {store} = makeStore();

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));
      const flow = store.getState().flow;
      if (flow.phase === 'offer-ready') {
        expect(flow.code.length).toBeGreaterThan(0);
        expect(flow.peerId).toBeTruthy();
      }
    });
  });

  describe('joinOffer', () => {
    it('transitions state to joining', () => {
      const {store} = makeStore();

      store.dispatch({type: 'JOIN_OFFER', code: 'any-code', passphrase: 'secret'});

      expect(store.getState().flow.phase).toBe('joining');
    });

    it('resets to idle when code cannot be decoded', async () => {
      const {store} = makeStore();

      store.dispatch({type: 'JOIN_OFFER', code: 'invalid-code', passphrase: 'wrong'});

      await vi.waitFor(() => expect(store.getState().flow).toEqual({phase: 'idle'}));
    });
  });

  describe('acceptAnswer', () => {
    it('does nothing when not in offer-ready phase', () => {
      const {store} = makeStore();

      store.dispatch({type: 'ACCEPT_ANSWER_CODE', responseCode: 'not-a-valid-code'});

      expect(store.getState().flow).toEqual({phase: 'idle'});
    });
  });

  describe('peer events', () => {
    it('PEER_CONNECTED adds peer', () => {
      const {store} = makeStore();

      store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'});

      expect(store.getState().peers).toEqual([{id: 'p1'}]);
    });

    it('PEER_NAMED updates peer name', () => {
      const {store} = makeStore();

      store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.dispatch({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'});

      expect(store.getState().peers).toEqual([{id: 'p1', name: 'Alice'}]);
    });

    it('PEER_DISCONNECTED removes peer', () => {
      const {store} = makeStore();

      store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.dispatch({type: 'PEER_DISCONNECTED', peerId: 'p1'});

      expect(store.getState().peers).toEqual([]);
    });
  });

  describe('trust', () => {
    it('GRANT_TRUST updates peer trusted state', () => {
      const {store} = makeStore();

      store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.dispatch({type: 'GRANT_TRUST', peerId: 'p1'});

      expect(store.getState().peers).toEqual([{id: 'p1', trusted: true}]);
    });

    it('REVOKE_TRUST clears peer trusted state', () => {
      const {store} = makeStore();

      store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.dispatch({type: 'GRANT_TRUST', peerId: 'p1'});
      store.dispatch({type: 'REVOKE_TRUST', peerId: 'p1'});

      expect(store.getState().peers).toEqual([{id: 'p1', trusted: false}]);
    });

    it('PEER_TRUST_UPDATED event updates peer trustsMe state', () => {
      const {store} = makeStore();

      store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.dispatch({type: 'PEER_TRUST_UPDATED', peerId: 'p1', trusts: true});

      expect(store.getState().peers).toEqual([{id: 'p1', trustsMe: true}]);
    });
  });

  describe('introductions', () => {
    it('ACCEPT_INTRODUCTION removes from pendingIntroductions', () => {
      const {store} = makeStore();

      store.dispatch({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.dispatch({type: 'ACCEPT_INTRODUCTION', introId: 'i1'});

      expect(store.getState().pendingIntroductions).toEqual([]);
    });

    it('DECLINE_INTRODUCTION removes from pendingIntroductions', () => {
      const {store} = makeStore();

      store.dispatch({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.dispatch({type: 'DECLINE_INTRODUCTION', introId: 'i1'});

      expect(store.getState().pendingIntroductions).toEqual([]);
    });

    it('INTRODUCTION_RECEIVED adds to pendingIntroductions', () => {
      const {store} = makeStore();

      store.dispatch({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});

      expect(store.getState().pendingIntroductions).toEqual([{introId: 'i1', from: 'Alice', peer: 'Carol'}]);
    });

    it('INTRODUCTION_RESOLVED removes from pendingIntroductions', () => {
      const {store} = makeStore();

      store.dispatch({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.dispatch({type: 'INTRODUCTION_RESOLVED', introId: 'i1'});

      expect(store.getState().pendingIntroductions).toEqual([]);
    });
  });

  describe('signaling', () => {
    it('ONLINE_PEERS_UPDATED action updates onlinePeers', () => {
      const {store} = makeStore();

      store.dispatch({type: 'ONLINE_PEERS_UPDATED', peers: [{peerId: 'p1', name: 'Alice'}]});

      expect(store.getState().onlinePeers).toEqual([{peerId: 'p1', name: 'Alice'}]);
    });

    it('ONLINE_PEER_JOINED action adds to onlinePeers', () => {
      const {store} = makeStore();

      store.dispatch({type: 'ONLINE_PEER_JOINED', peerId: 'p1', name: 'Alice'});

      expect(store.getState().onlinePeers).toEqual([{peerId: 'p1', name: 'Alice'}]);
    });

    it('ONLINE_PEER_LEFT action removes from onlinePeers', () => {
      const {store} = makeStore();

      store.dispatch({type: 'ONLINE_PEERS_UPDATED', peers: [{peerId: 'p1', name: 'Alice'}]});
      store.dispatch({type: 'ONLINE_PEER_LEFT', peerId: 'p1'});

      expect(store.getState().onlinePeers).toEqual([]);
    });
  });

  describe('ICE restart', () => {
    const connectViaServerAndGetOfferSdp = async (store: ReturnType<typeof makeStore>['store']) => {
      const dispatched: ConnectionsAction[] = [];
      store.dispatch = ((original) => (action: ConnectionsAction) => {
        dispatched.push(action);
        return original(action);
      })(store.dispatch);

      store.dispatch({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig', name: 'Bob'});
      await vi.waitFor(() => expect(dispatched).toContainEqual(expect.objectContaining({type: 'RELAY_OFFER'})));
      return (dispatched.find(a => a.type === 'RELAY_OFFER') as {sdp: string}).sdp;
    };

    it('ICE disconnect marks peer as unstable in store state', async () => {
      const {store, factory} = makeStore();

      const offerSdp = await connectViaServerAndGetOfferSdp(store);
      factory.simulateIceStateChange(offerSdp, 'disconnected');

      await vi.waitFor(() =>
        expect(Object.values(store.getState().peerConnectionHealth)).toContain('unstable')
      );
    });

    it('ICE recovery marks peer as stable in store state', async () => {
      const {store, factory} = makeStore();

      const offerSdp = await connectViaServerAndGetOfferSdp(store);
      factory.simulateIceStateChange(offerSdp, 'disconnected');
      await vi.waitFor(() => expect(Object.values(store.getState().peerConnectionHealth)).toContain('unstable'));

      factory.simulateIceStateChange(offerSdp, 'connected');

      await vi.waitFor(() =>
        expect(Object.values(store.getState().peerConnectionHealth)).toContain('stable')
      );
    });

    it('ICE disconnect triggers RELAY_ICE_RESTART dispatch', async () => {
      const dispatched: ConnectionsAction[] = [];
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
      const received1: ConnectionsAction[] = [];
      const received2: ConnectionsAction[] = [];
      const noop = () => {};
      const composed = applyMiddleware([
        () => (next) => (action) => { received1.push(action); next(action); },
        () => (next) => (action) => { received2.push(action); next(action); },
      ]);
      const action: ConnectionsAction = {type: 'CREATE_OFFER', passphrase: 'secret'};
      const dispatch = composed({dispatch: noop, getState: () => ({flow: {phase: 'idle'}, peers: [], pendingIntroductions: [], onlinePeers: [], previousPeers: [], peerConnectionHealth: {}, handlerState: {signalingToPeer: {}, peerToSignaling: {}, offererPeerIds: [], iceRestartAttempts: {}}}), addListener: () => () => {}})(noop);

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
      const dispatch = composed({dispatch: noop, getState: () => ({flow: {phase: 'idle'}, peers: [], pendingIntroductions: [], onlinePeers: [], previousPeers: [], peerConnectionHealth: {}, handlerState: {signalingToPeer: {}, peerToSignaling: {}, offererPeerIds: [], iceRestartAttempts: {}}}), addListener: () => () => {}})(baseDispatch);

      dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(order).toEqual(['middleware', 'base']);
    });

    it('is a no-op for an empty list', () => {
      const noop = () => {};
      const composed = applyMiddleware([]);
      const dispatch = composed({dispatch: noop, getState: () => ({flow: {phase: 'idle'}, peers: [], pendingIntroductions: [], onlinePeers: [], previousPeers: [], peerConnectionHealth: {}, handlerState: {signalingToPeer: {}, peerToSignaling: {}, offererPeerIds: [], iceRestartAttempts: {}}}), addListener: () => () => {}})(noop);
      expect(() => dispatch({type: 'CREATE_OFFER', passphrase: 'secret'})).not.toThrow();
    });
  });

  describe('middleware', () => {
    it('receives every dispatched action', () => {
      const actions: ConnectionsAction[] = [];
      const {store} = makeStore([() => (next) => (action) => { actions.push(action); next(action); }]);

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(actions).toContainEqual({type: 'CREATE_OFFER', passphrase: 'secret'});
    });
  });

  describe('subscribe', () => {
    it('notifies listener on state change', () => {
      const {store} = makeStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(listener).toHaveBeenCalled();
    });

    it('unsubscribe stops notifications', () => {
      const {store} = makeStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('addListener', () => {
    it('receives action and prevState and state after dispatch', () => {
      const {store} = makeStore();
      const received: Array<{action: ConnectionsAction; prevState: ConnectionsState; state: ConnectionsState}> = [];
      store.addListener((action, {prevState, state}) => received.push({action, prevState, state}));

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      const entry = received.find(r => r.action.type === 'CREATE_OFFER');
      expect(entry).toBeDefined();
      expect(entry!.prevState.flow.phase).toBe('idle');
      expect(entry!.state.flow.phase).toBe('creating');
    });

    it('receives post-reducer state', () => {
      const {store} = makeStore();
      let seenState: ConnectionsState | undefined;
      store.addListener((_action, {state}) => { seenState = state; });

      store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'});

      expect(seenState?.peers).toContainEqual({id: 'p1'});
    });

    it('can dispatch from listener and the action enters the full chain', () => {
      const {store} = makeStore();
      const seen: string[] = [];
      store.addListener((action, {dispatch}) => {
        seen.push(action.type);
        if (action.type === 'PEER_CONNECTED') dispatch({type: 'PEER_NAMED', peerId: action.peerId, name: 'Alice'});
      });

      store.dispatch({type: 'PEER_CONNECTED', peerId: 'p1'});

      expect(seen).toContain('PEER_CONNECTED');
      expect(seen).toContain('PEER_NAMED');
      expect(store.getState().peers).toContainEqual({id: 'p1', name: 'Alice'});
    });

    it('unsubscribe stops listener from receiving actions', () => {
      const {store} = makeStore();
      const received: ConnectionsAction[] = [];
      const unsubscribe = store.addListener((action) => received.push(action));

      unsubscribe();
      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(received).toHaveLength(0);
    });
  });
});
