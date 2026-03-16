import {createConnectionStore} from './connectionStore';
import {success, failure} from '../lib/result';
import type {PeerEvent} from '../types/worker-messages';
import type {ConnectionsAction} from './connections';

const makeStore = () => {
  let emitFn: (event: PeerEvent) => void = () => {};
  const commands: Array<{type: string; [key: string]: unknown}> = [];
  const middlewareActions: Array<ConnectionsAction> = [];

  const store = createConnectionStore({
    createHandler: (emit) => {
      emitFn = emit;
      return {handleCommand: (cmd: {type: string}) => commands.push(cmd)};
    },
    encodeCode: async (sdp: string) => `encoded:${sdp}`,
    decodeCode: async (code: string) =>
      code.startsWith('encoded:')
        ? success(code.slice(8))
        : failure('DECRYPT_FAILED' as const),
  });

  store.applyMiddleware((action) => middlewareActions.push(action));

  return {store, commands, middlewareActions, emit: (e: PeerEvent) => emitFn(e)};
};

describe('connectionStore', () => {
  describe('createOffer', () => {
    it('transitions state to creating', () => {
      const {store} = makeStore();

      store.createOffer('secret');

      expect(store.getState().flow).toEqual({phase: 'creating', passphrase: 'secret'});
    });

    it('sends CREATE_OFFER command to handler', () => {
      const {store, commands} = makeStore();

      store.createOffer('secret');

      expect(commands).toContainEqual(expect.objectContaining({type: 'CREATE_OFFER'}));
    });

    it('transitions to offer-ready after SDP is created and encoded', async () => {
      const {store, emit} = makeStore();

      store.createOffer('secret');
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
    it('transitions state to joining', async () => {
      const {store} = makeStore();

      await store.joinOffer('encoded:v=0', 'secret').value;

      expect(store.getState().flow.phase).toBe('joining');
    });

    it('sends ACCEPT_OFFER command with decoded SDP', async () => {
      const {store, commands} = makeStore();

      await store.joinOffer('encoded:v=0', 'secret').value;

      expect(commands).toContainEqual(expect.objectContaining({type: 'ACCEPT_OFFER'}));
    });

    it('resets to idle when code cannot be decoded', async () => {
      const {store} = makeStore();

      await store.joinOffer('invalid-code', 'wrong').value;

      expect(store.getState().flow).toEqual({phase: 'idle'});
    });

    it('returns success when code decodes', async () => {
      const {store} = makeStore();

      const result = await store.joinOffer('encoded:v=0', 'secret').value;

      expect(result.kind).toBe('success');
    });

    it('returns failure when code cannot be decoded', async () => {
      const {store} = makeStore();

      const result = await store.joinOffer('invalid-code', 'wrong').value;

      expect(result.kind).toBe('failure');
    });
  });

  describe('acceptAnswer', () => {
    it('sends ACCEPT_ANSWER command with decoded SDP when offer-ready', async () => {
      const {store, emit, commands} = makeStore();

      store.createOffer('secret');
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'});
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));

      await store.acceptAnswer('encoded:v=answer').value;

      expect(commands).toContainEqual(expect.objectContaining({type: 'ACCEPT_ANSWER'}));
    });

    it('does nothing when not in offer-ready phase', async () => {
      const {store, commands} = makeStore();
      const commandsBeforeLength = commands.length;

      await store.acceptAnswer('encoded:v=answer').value;

      expect(commands.length).toBe(commandsBeforeLength);
    });

    it('returns success when response code decodes', async () => {
      const {store, emit} = makeStore();

      store.createOffer('secret');
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'});
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));

      const result = await store.acceptAnswer('encoded:v=answer').value;

      expect(result.kind).toBe('success');
    });

    it('returns failure when response code cannot be decoded', async () => {
      const {store, emit} = makeStore();

      store.createOffer('secret');
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'});
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));

      const result = await store.acceptAnswer('invalid-code').value;

      expect(result.kind).toBe('failure');
    });

    it('reads current passphrase from state, not from when store was created', async () => {
      const {store, emit} = makeStore();

      store.createOffer('runtime-passphrase');
      emit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'});
      await vi.waitFor(() => expect(store.getState().flow.phase).toBe('offer-ready'));

      let decodedWith = '';
      const customDecode = async (code: string, pass: string) => {
        decodedWith = pass;
        return success(code);
      };
      let innerEmit: (event: PeerEvent) => void = () => {};
      const customStore = createConnectionStore({
        createHandler: (emit) => { innerEmit = emit; return {handleCommand: () => {}}; },
        encodeCode: async (sdp) => `encoded:${sdp}`,
        decodeCode: customDecode,
      });
      customStore.createOffer('runtime-passphrase');
      innerEmit({type: 'OFFER_CREATED', peerId: 'p1', sdp: 'v=0'});
      await vi.waitFor(() => expect(customStore.getState().flow.phase).toBe('offer-ready'));

      await customStore.acceptAnswer('encoded:v=answer');

      expect(decodedWith).toBe('runtime-passphrase');
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
    it('sends DISCONNECT command with the peerId', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.disconnect('p1');

      expect(commands).toContainEqual(expect.objectContaining({type: 'DISCONNECT'}));
    });

    it('removes the peer when PEER_DISCONNECTED event arrives', () => {
      const {store, emit} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      emit({type: 'PEER_DISCONNECTED', peerId: 'p1'});

      expect(store.getState().peers).toEqual([]);
    });
  });

  describe('trust', () => {
    it('grantTrust sends GRANT_TRUST command', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.grantTrust('p1');

      expect(commands).toContainEqual(expect.objectContaining({type: 'GRANT_TRUST'}));
    });

    it('grantTrust updates peer trusted state', () => {
      const {store, emit} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.grantTrust('p1');

      expect(store.getState().peers).toEqual([{id: 'p1', trusted: true}]);
    });

    it('revokeTrust sends REVOKE_TRUST command', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.revokeTrust('p1');

      expect(commands).toContainEqual(expect.objectContaining({type: 'REVOKE_TRUST'}));
    });

    it('revokeTrust clears peer trusted state', () => {
      const {store, emit} = makeStore();

      emit({type: 'PEER_CONNECTED', peerId: 'p1'});
      store.grantTrust('p1');
      store.revokeTrust('p1');

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
    it('introducePeers sends INTRODUCE_PEERS command', () => {
      const {store, commands} = makeStore();

      store.introducePeers('p1', 'p2');

      expect(commands).toContainEqual(expect.objectContaining({type: 'INTRODUCE_PEERS'}));
    });

    it('acceptIntroduction sends ACCEPT_INTRODUCTION command', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.acceptIntroduction('i1');

      expect(commands).toContainEqual(expect.objectContaining({type: 'ACCEPT_INTRODUCTION'}));
    });

    it('acceptIntroduction removes from pendingIntroductions', () => {
      const {store, emit} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.acceptIntroduction('i1');

      expect(store.getState().pendingIntroductions).toEqual([]);
    });

    it('declineIntroduction sends DECLINE_INTRODUCTION command', () => {
      const {store, emit, commands} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.declineIntroduction('i1');

      expect(commands).toContainEqual(expect.objectContaining({type: 'DECLINE_INTRODUCTION'}));
    });

    it('declineIntroduction removes from pendingIntroductions', () => {
      const {store, emit} = makeStore();

      emit({type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});
      store.declineIntroduction('i1');

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

    it('SERVER_OFFER_RECEIVED action sends SERVER_OFFER_RECEIVED command to handler', () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: 'bob-sig', name: 'Bob', sdp: 'offer-sdp'});

      expect(commands).toContainEqual({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: 'bob-sig', name: 'Bob', sdp: 'offer-sdp'});
    });

    it('SERVER_ANSWER_RECEIVED action sends SERVER_ANSWER_RECEIVED command to handler', () => {
      const {store, commands} = makeStore();

      store.dispatch({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: 'bob-sig', sdp: 'answer-sdp'});

      expect(commands).toContainEqual({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: 'bob-sig', sdp: 'answer-sdp'});
    });

    it('SERVER_OFFER_CREATED event dispatches RELAY_OFFER to middleware', () => {
      const {emit, middlewareActions} = makeStore();

      emit({type: 'SERVER_OFFER_CREATED', signalingPeerId: 'bob-sig', localPeerId: 'local-p1', sdp: 'offer-sdp'});

      expect(middlewareActions).toContainEqual({type: 'RELAY_OFFER', targetPeerId: 'bob-sig', sdp: 'offer-sdp'});
    });

    it('SERVER_ANSWER_CREATED event dispatches RELAY_ANSWER to middleware', () => {
      const {emit, middlewareActions} = makeStore();

      emit({type: 'SERVER_ANSWER_CREATED', signalingPeerId: 'alice-sig', sdp: 'answer-sdp'});

      expect(middlewareActions).toContainEqual({type: 'RELAY_ANSWER', targetPeerId: 'alice-sig', sdp: 'answer-sdp'});
    });

    it('connectViaPeer sends CONNECT_VIA_SERVER command to handler', () => {
      const {store, commands} = makeStore();

      store.connectViaPeer('bob-sig', 'Bob');

      expect(commands).toContainEqual({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig', name: 'Bob'});
    });
  });

  describe('applyMiddleware', () => {
    it('receives every dispatched action', () => {
      const {store} = makeStore();
      const actions: ConnectionsAction[] = [];
      store.applyMiddleware((action) => actions.push(action));

      store.createOffer('secret');

      expect(actions).toContainEqual({type: 'CREATE_OFFER', passphrase: 'secret'});
    });

    it('unsubscribe stops receiving actions', () => {
      const {store} = makeStore();
      const actions: ConnectionsAction[] = [];
      const unsubscribe = store.applyMiddleware((action) => actions.push(action));

      unsubscribe();
      store.createOffer('secret');

      expect(actions).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    it('notifies listener on state change', () => {
      const {store} = makeStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.createOffer('secret');

      expect(listener).toHaveBeenCalled();
    });

    it('unsubscribe stops notifications', () => {
      const {store} = makeStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.createOffer('secret');

      expect(listener).not.toHaveBeenCalled();
    });
  });
});