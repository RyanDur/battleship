import {createConnectionStore, createHandlerMiddleware, encodingMiddleware, codecMiddleware, applyMiddleware} from './connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {ConnectionStore, MiddlewareFactory} from './connectionStore';
import type {ConnectionFlow} from './connections';

const makeRelayMiddleware = (myName: string, mySigId: string, getOther: () => ConnectionStore): MiddlewareFactory =>
  (_deps) => (next) => (action) => {
    if (action.type === 'RELAY_OFFER') {
      getOther().dispatch({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: mySigId, name: myName, sdp: action.sdp});
    } else if (action.type === 'RELAY_ANSWER') {
      getOther().dispatch({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: mySigId, sdp: action.sdp});
    }
    next(action);
  };

const makePair = () => {
  const factory = createFakePeerConnectionFactory();
  const stores: {alice?: ConnectionStore; bob?: ConnectionStore} = {};

  stores.alice = createConnectionStore(applyMiddleware([
    createHandlerMiddleware({name: 'Alice', createPeerConnection: factory.createPeerConnection}),
    makeRelayMiddleware('Alice', 'alice-sig', () => stores.bob!),
  ]));

  stores.bob = createConnectionStore(applyMiddleware([
    createHandlerMiddleware({name: 'Bob', createPeerConnection: factory.createPeerConnection}),
    makeRelayMiddleware('Bob', 'bob-sig', () => stores.alice!),
  ]));

  const connect = async () => {
    stores.alice!.dispatch({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig', name: 'Bob'});
    await vi.waitFor(() => {
      expect(stores.alice!.getState().peers).toHaveLength(1);
      expect(stores.bob!.getState().peers).toHaveLength(1);
    });
  };

  return {alice: stores.alice!, bob: stores.bob!, connect};
};

describe('createHandlerMiddleware (store)', () => {
  it('CONNECT_VIA_SERVER connects both stores via server relay', async () => {
    const {alice, bob, connect} = makePair();

    await connect();

    expect(alice.getState().peers).toHaveLength(1);
    expect(bob.getState().peers).toHaveLength(1);
  });

  it('DISCONNECT dispatch removes peer from state', async () => {
    const {alice, connect} = makePair();
    await connect();
    const peerId = alice.getState().peers[0].id;

    alice.dispatch({type: 'DISCONNECT', peerId});

    await vi.waitFor(() => expect(alice.getState().peers).toHaveLength(0));
  });

  it('GRANT_TRUST dispatch updates trustsMe on the remote store', async () => {
    const {alice, bob, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = bob.getState().peers[0].id;

    bob.dispatch({type: 'GRANT_TRUST', peerId: alicePeerIdOnBob});

    await vi.waitFor(() => expect(alice.getState().peers[0].trustsMe).toBe(true));
  });

  it('REVOKE_TRUST dispatch clears trustsMe on the remote store', async () => {
    const {alice, bob, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = bob.getState().peers[0].id;

    bob.dispatch({type: 'GRANT_TRUST', peerId: alicePeerIdOnBob});
    await vi.waitFor(() => expect(alice.getState().peers[0].trustsMe).toBe(true));

    bob.dispatch({type: 'REVOKE_TRUST', peerId: alicePeerIdOnBob});

    await vi.waitFor(() => expect(alice.getState().peers[0].trustsMe).toBe(false));
  });

  it('full offer/answer handshake connects both stores', async () => {
    const factory = createFakePeerConnectionFactory();

    const alice = createConnectionStore(applyMiddleware([
      createHandlerMiddleware({name: 'Alice', createPeerConnection: factory.createPeerConnection}),
      encodingMiddleware,
      codecMiddleware,
    ]));

    const bob = createConnectionStore(applyMiddleware([
      createHandlerMiddleware({name: 'Bob', createPeerConnection: factory.createPeerConnection}),
      encodingMiddleware,
      codecMiddleware,
    ]));

    alice.dispatch({type: 'CREATE_OFFER', passphrase: 'secret'});
    await vi.waitFor(() => expect(alice.getState().flow.phase).toBe('offer-ready'));
    const offerFlow = alice.getState().flow as Extract<ConnectionFlow, {phase: 'offer-ready'}>;

    bob.dispatch({type: 'JOIN_OFFER', code: offerFlow.code, passphrase: 'secret'});
    await vi.waitFor(() => expect(bob.getState().flow.phase).toBe('answer-ready'));
    const answerFlow = bob.getState().flow as Extract<ConnectionFlow, {phase: 'answer-ready'}>;

    alice.dispatch({type: 'ACCEPT_ANSWER_CODE', responseCode: answerFlow.code});

    await vi.waitFor(() => {
      expect(alice.getState().peers).toHaveLength(1);
      expect(bob.getState().peers).toHaveLength(1);
    });
  });
});
