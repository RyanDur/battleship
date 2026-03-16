import {createConnectionStore, createHandlerMiddleware, encodingMiddleware, codecMiddleware, applyMiddleware} from './connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {ConnectionsAction} from './connections';
import type {MiddlewareFactory} from './connectionStore';

const makeStore = (extra: MiddlewareFactory[] = []) => {
  const factory = createFakePeerConnectionFactory();
  const store = createConnectionStore(applyMiddleware([
    createHandlerMiddleware({name: 'Player', createPeerConnection: factory.createPeerConnection}),
    encodingMiddleware,
    codecMiddleware,
    ...extra,
  ]));
  return {store};
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

  describe('applyMiddleware (standalone)', () => {
    it('fans out action to all middleware in list', () => {
      const received1: ConnectionsAction[] = [];
      const received2: ConnectionsAction[] = [];
      const noop = () => {};
      const composed = applyMiddleware([
        () => (action) => received1.push(action),
        () => (action) => received2.push(action),
      ]);
      const action: ConnectionsAction = {type: 'CREATE_OFFER', passphrase: 'secret'};
      const middleware = composed({dispatch: noop, getState: () => ({flow: {phase: 'idle'}, peers: [], pendingIntroductions: [], onlinePeers: [], previousPeers: [], peerConnectionHealth: {}})});

      middleware(action);

      expect(received1).toContainEqual(action);
      expect(received2).toContainEqual(action);
    });

    it('is a no-op for an empty list', () => {
      const noop = () => {};
      const composed = applyMiddleware([]);
      const middleware = composed({dispatch: noop, getState: () => ({flow: {phase: 'idle'}, peers: [], pendingIntroductions: [], onlinePeers: [], previousPeers: [], peerConnectionHealth: {}})});
      expect(() => middleware({type: 'CREATE_OFFER', passphrase: 'secret'})).not.toThrow();
    });
  });

  describe('middleware', () => {
    it('receives every dispatched action', () => {
      const actions: ConnectionsAction[] = [];
      const {store} = makeStore([() => (action) => actions.push(action)]);

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
});
