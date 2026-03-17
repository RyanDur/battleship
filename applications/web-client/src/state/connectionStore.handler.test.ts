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

const makeRelayForAll = (myName: string, myId: string, registry: Record<string, () => ConnectionStore | undefined>): MiddlewareFactory =>
  (_deps) => (next) => (action) => {
    if (action.type === 'RELAY_OFFER') {
      registry[action.targetPeerId]?.()?.dispatch({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: myId, name: myName, sdp: action.sdp});
    } else if (action.type === 'RELAY_ANSWER') {
      registry[action.targetPeerId]?.()?.dispatch({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: myId, sdp: action.sdp});
    }
    next(action);
  };

const makeTriple = () => {
  const factory = createFakePeerConnectionFactory();
  const stores: {alice?: ConnectionStore; bob?: ConnectionStore; carol?: ConnectionStore} = {};
  const registry: Record<string, () => ConnectionStore | undefined> = {};

  stores.alice = createConnectionStore(applyMiddleware([
    createHandlerMiddleware({name: 'Alice', createPeerConnection: factory.createPeerConnection}),
    makeRelayForAll('Alice', 'alice-sig', registry),
  ]));
  stores.bob = createConnectionStore(applyMiddleware([
    createHandlerMiddleware({name: 'Bob', createPeerConnection: factory.createPeerConnection}),
    makeRelayForAll('Bob', 'bob-sig', registry),
  ]));
  stores.carol = createConnectionStore(applyMiddleware([
    createHandlerMiddleware({name: 'Carol', createPeerConnection: factory.createPeerConnection}),
    makeRelayForAll('Carol', 'carol-sig', registry),
  ]));
  registry['alice-sig'] = () => stores.alice;
  registry['bob-sig'] = () => stores.bob;
  registry['carol-sig'] = () => stores.carol;

  const connect = async () => {
    stores.alice!.dispatch({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig', name: 'Bob'});
    stores.alice!.dispatch({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'carol-sig', name: 'Carol'});
    await vi.waitFor(() => {
      expect(stores.alice!.getState().peers).toHaveLength(2);
      expect(stores.bob!.getState().peers).toHaveLength(1);
      expect(stores.carol!.getState().peers).toHaveLength(1);
    });
    await vi.waitFor(() => expect(stores.alice!.getState().peers.every(p => p.name)).toBe(true));
  };

  return {alice: stores.alice!, bob: stores.bob!, carol: stores.carol!, connect};
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

  it('CONNECT_VIA_SERVER to a previous peer removes them from previousPeers', async () => {
    const {alice, connect} = makePair();
    alice.dispatch({type: 'PREVIOUS_PEERS_RECEIVED', peers: [{peerId: 'bob-sig', name: 'Bob', online: false}]});

    await connect();

    await vi.waitFor(() => expect(alice.getState().previousPeers).toHaveLength(0));
  });

  it('receiving an INTRODUCTION records the relay peer in handlerState.introChannels', async () => {
    const {alice, bob, connect} = makeTriple();
    await connect();

    const bobPeerId = alice.getState().peers.find(p => p.name === 'Bob')!.id;
    const carolPeerId = alice.getState().peers.find(p => p.name === 'Carol')!.id;
    alice.dispatch({type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId});

    await vi.waitFor(() => expect(bob.getState().pendingIntroductions).toHaveLength(1));
    const introId = bob.getState().pendingIntroductions[0].introId;

    expect(bob.getState().handlerState.introChannels).toHaveProperty(introId);
  });

  it('ACCEPT_INTRODUCTION removes the intro from handlerState.introChannels', async () => {
    const {alice, bob, connect} = makeTriple();
    await connect();

    const bobPeerId = alice.getState().peers.find(p => p.name === 'Bob')!.id;
    const carolPeerId = alice.getState().peers.find(p => p.name === 'Carol')!.id;
    alice.dispatch({type: 'INTRODUCE_PEERS', peerId1: bobPeerId, peerId2: carolPeerId});

    await vi.waitFor(() => expect(bob.getState().pendingIntroductions).toHaveLength(1));
    const introId = bob.getState().pendingIntroductions[0].introId;

    bob.dispatch({type: 'ACCEPT_INTRODUCTION', introId});

    expect(bob.getState().handlerState.introChannels).not.toHaveProperty(introId);
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
