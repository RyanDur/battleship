import {createConnectionStore, createHandlerMiddleware, createEncodingMiddleware, createCodecMiddleware, applyMiddleware} from './connectionStore';
import {success, failure} from '../lib/result';
import type {PeerEvent} from '../types/worker-messages';
import type {ConnectionsAction} from './connections';

const makeStore = () => {
  let emitFn: (event: PeerEvent) => void = () => {};
  const commands: Array<{type: string; [key: string]: unknown}> = [];

  const store = createConnectionStore();

  store.applyMiddleware(createHandlerMiddleware({
    createHandler: (emit) => {
      emitFn = emit;
      return {handleCommand: (cmd) => commands.push(cmd)};
    },
    dispatch: store.dispatch,
  }));

  store.applyMiddleware(createEncodingMiddleware({
    encodeCode: async (sdp: string) => `encoded:${sdp}`,
    getState: store.getState,
    dispatch: store.dispatch,
  }));

  store.applyMiddleware(createCodecMiddleware({
    decodeCode: async (code: string) =>
      code.startsWith('encoded:')
        ? success(code.slice(8))
        : failure('DECRYPT_FAILED' as const),
    getState: store.getState,
    dispatch: store.dispatch,
  }));

  return {store, commands, emit: (e: PeerEvent) => emitFn(e)};
};

describe('connectionStore', () => {
  describe('createOffer', () => {
    it('transitions state to creating', () => {
      const {store} = makeStore();

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(store.getState().flow).toEqual({phase: 'creating', passphrase: 'secret'});
    });

    it('sends CREATE_OFFER command to handler', () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(commands).toContainEqual({type: 'CREATE_OFFER'});
    });

    it('transitions to offer-ready after SDP is created and encoded', async () => {
      const {store, emit} = makeStore();

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'});

      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));
      const flow = store.getState().flow;
      if (flow.phase === 'offer-ready') {
        expect(flow.code).toBe('encoded:v=0');
        expect(flow.peerId).toBe('p1');
      }
    });
  });

  describe('joinOffer', () => {
    it('transitions state to joining', () => {
      const {store} = makeStore();

      store.dispatch({type: 'JOIN_OFFER', code: 'encoded:v=0', passphrase: 'secret'});

      expect(store.getState().flow.phase).toBe('joining');
    });

    it('sends ACCEPT_OFFER command with decoded SDP', async () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'JOIN_OFFER', code: 'encoded:v=0', passphrase: 'secret'});

      await vi.waitFor(() => expect(commands).toContainEqual(expect.objectContaining({type: 'ACCEPT_OFFER'})));
    });

    it('resets to idle when code cannot be decoded', async () => {
      const {store} = makeStore();

      store.dispatch({type: 'JOIN_OFFER', code: 'invalid-code', passphrase: 'wrong'});

      await vi.waitFor(() => expect(store.getState().flow).toEqual({phase: 'idle'}));
    });
  });

  describe('acceptAnswer', () => {
    it('sends ACCEPT_ANSWER command with decoded SDP when offer-ready', async () => {
      const {store, emit, commands} = makeStore();

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'});
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));

      store.dispatch({type: 'ACCEPT_ANSWER_CODE', responseCode: 'encoded:v=answer'});

      await vi.waitFor(() => expect(commands).toContainEqual({type: 'ACCEPT_ANSWER', peerId: 'p1', sdp: 'v=answer'}));
    });

    it('does nothing when not in offer-ready phase', () => {
      const {store, commands} = makeStore();
      const commandsBeforeLength = commands.length;

      store.dispatch({type: 'ACCEPT_ANSWER_CODE', responseCode: 'encoded:v=answer'});

      expect(commands.length).toBe(commandsBeforeLength);
    });

    it('reads peerId and passphrase from state flow', async () => {
      const {store, emit, commands} = makeStore();

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'runtime-passphrase'});
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'});
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));

      store.dispatch({type: 'ACCEPT_ANSWER_CODE', responseCode: 'encoded:v=answer'});

      await vi.waitFor(() =>
        expect(commands).toContainEqual({type: 'ACCEPT_ANSWER', peerId: 'p1', sdp: 'v=answer'})
      );
    });
  });

  describe('peer events', () => {
    it('PEER_CONNECTED adds peer', () => {
      const {store, emit} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});

      expect(store.getState().peers).toEqual([{id: 'p1'}]);
    });

    it('PEER_NAMED updates peer name', () => {
      const {store, emit} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      emit({type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'});

      expect(store.getState().peers).toEqual([{id: 'p1', name: 'Alice'}]);
    });

    it('PEER_DISCONNECTED removes peer', () => {
      const {store, emit} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      emit({type: 'PEER_DISCONNECTED', peerId: 'p1'});

      expect(store.getState().peers).toEqual([]);
    });
  });

  describe('disconnect', () => {
    it('sends DISCONNECT command', () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'DISCONNECT', peerId: 'p1'});

      expect(commands).toContainEqual({type: 'DISCONNECT', peerId: 'p1'});
    });

    it('removes the peer when PEER_DISCONNECTED event arrives', () => {
      const {store, emit} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      emit({type: 'PEER_DISCONNECTED', peerId: 'p1'});

      expect(store.getState().peers).toEqual([]);
    });
  });

  describe('trust', () => {
    it('GRANT_TRUST sends command and updates peer trusted state', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.dispatch({type: 'GRANT_TRUST', peerId: 'p1'});

      expect(commands).toContainEqual({type: 'GRANT_TRUST', peerId: 'p1'});
      expect(store.getState().peers).toEqual([{id: 'p1', trusted: true}]);
    });

    it('REVOKE_TRUST sends command and clears peer trusted state', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.dispatch({type: 'GRANT_TRUST', peerId: 'p1'});
      store.dispatch({type: 'REVOKE_TRUST', peerId: 'p1'});

      expect(commands).toContainEqual({type: 'REVOKE_TRUST', peerId: 'p1'});
      expect(store.getState().peers).toEqual([{id: 'p1', trusted: false}]);
    });

    it('PEER_TRUST_UPDATED event updates peer trustsMe state', () => {
      const {store, emit} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      emit({type: 'PEER_TRUST_UPDATED', peerId: 'p1', trusts: true});

      expect(store.getState().peers).toEqual([{id: 'p1', trustsMe: true}]);
    });
  });

  describe('introductions', () => {
    it('INTRODUCE_PEERS sends command', () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'INTRODUCE_PEERS', peerId1: 'p1', peerId2: 'p2'});

      expect(commands).toContainEqual({type: 'INTRODUCE_PEERS', peerId1: 'p1', peerId2: 'p2'});
    });

    it('ACCEPT_INTRODUCTION sends command and removes from pendingIntroductions', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.dispatch({type: 'ACCEPT_INTRODUCTION', introId: 'i1'});

      expect(commands).toContainEqual({type: 'ACCEPT_INTRODUCTION', introId: 'i1'});
      expect(store.getState().pendingIntroductions).toEqual([]);
    });

    it('DECLINE_INTRODUCTION sends command and removes from pendingIntroductions', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.dispatch({type: 'DECLINE_INTRODUCTION', introId: 'i1'});

      expect(commands).toContainEqual({type: 'DECLINE_INTRODUCTION', introId: 'i1'});
      expect(store.getState().pendingIntroductions).toEqual([]);
    });

    it('INTRODUCTION_RECEIVED event adds to pendingIntroductions', () => {
      const {store, emit} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});

      expect(store.getState().pendingIntroductions).toEqual([{introId: 'i1', from: 'Alice', peer: 'Carol'}]);
    });

    it('INTRODUCTION_DECLINED event removes from pendingIntroductions', () => {
      const {store, emit} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      emit({type: 'INTRODUCTION_DECLINED', introId: 'i1'});

      expect(store.getState().pendingIntroductions).toEqual([]);
    });

    it('INTRODUCTION_EXPIRED event removes from pendingIntroductions', () => {
      const {store, emit} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      emit({type: 'INTRODUCTION_EXPIRED', introId: 'i1'});

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

    it('SERVER_OFFER_RECEIVED action sends handler command', () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: 'bob-sig', name: 'Bob', sdp: 'offer-sdp'});

      expect(commands).toContainEqual({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: 'bob-sig', name: 'Bob', sdp: 'offer-sdp'});
    });

    it('SERVER_ANSWER_RECEIVED action sends handler command', () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: 'bob-sig', sdp: 'answer-sdp'});

      expect(commands).toContainEqual({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: 'bob-sig', sdp: 'answer-sdp'});
    });

    it('SERVER_OFFER_CREATED event dispatches RELAY_OFFER', () => {
      const {store, emit} = makeStore();
      const actions: ConnectionsAction[] = [];
      store.applyMiddleware((action) => actions.push(action));

      emit({type: 'SERVER_OFFER_CREATED', signalingPeerId: 'bob-sig', localPeerId: 'local-p1', sdp: 'offer-sdp'});

      expect(actions).toContainEqual({type: 'RELAY_OFFER', targetPeerId: 'bob-sig', sdp: 'offer-sdp'});
    });

    it('SERVER_ANSWER_CREATED event dispatches RELAY_ANSWER', () => {
      const {store, emit} = makeStore();
      const actions: ConnectionsAction[] = [];
      store.applyMiddleware((action) => actions.push(action));

      emit({type: 'SERVER_ANSWER_CREATED', signalingPeerId: 'alice-sig', sdp: 'answer-sdp'});

      expect(actions).toContainEqual({type: 'RELAY_ANSWER', targetPeerId: 'alice-sig', sdp: 'answer-sdp'});
    });

    it('CONNECT_VIA_SERVER dispatches handler command', () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig', name: 'Bob'});

      expect(commands).toContainEqual({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig', name: 'Bob'});
    });
  });

  describe('applyMiddleware (standalone)', () => {
    it('fans out action to all middleware in list', () => {
      const received1: ConnectionsAction[] = [];
      const received2: ConnectionsAction[] = [];
      const composed = applyMiddleware([
        (action) => received1.push(action),
        (action) => received2.push(action),
      ]);
      const action: ConnectionsAction = {type: 'CREATE_OFFER', passphrase: 'secret'};

      composed(action);

      expect(received1).toContainEqual(action);
      expect(received2).toContainEqual(action);
    });

    it('is a no-op for an empty list', () => {
      const composed = applyMiddleware([]);
      expect(() => composed({type: 'CREATE_OFFER', passphrase: 'secret'})).not.toThrow();
    });
  });

  describe('applyMiddleware', () => {
    it('receives every dispatched action', () => {
      const {store} = makeStore();
      const actions: ConnectionsAction[] = [];
      store.applyMiddleware((action) => actions.push(action));

      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(actions).toContainEqual({type: 'CREATE_OFFER', passphrase: 'secret'});
    });

    it('unsubscribe stops receiving actions', () => {
      const {store} = makeStore();
      const actions: ConnectionsAction[] = [];
      const unsubscribe = store.applyMiddleware((action) => actions.push(action));

      unsubscribe();
      store.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});

      expect(actions).toHaveLength(0);
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
