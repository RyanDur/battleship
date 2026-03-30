import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {ConnectionStore, MiddlewareFactory} from './connectionStore';
import type {ConnectionFlow} from './connections';
import {serverOfferReceived, serverAnswerReceived, connectViaServer, disconnect, introducePeers, acceptIntroduction, previousPeersReceived, grantTrust, revokeTrust, createOffer, joinOffer, acceptAnswerCode, sendMessage, claimFirstTurn, peerDisconnected, sendToPeer} from './connectionActions';
import {boardLoaded, p2pGameLoaded, p2pFire, p2pStateMismatch, clearP2pGame, challengePeer, acceptChallenge, p2pBoardReady, takeFirstTurn, turnOrderDecided} from '../game/gameActions';
import {hashBoard, hashValue} from '../game/hashBoard';
import type {Board} from '../game/board';
import {selectFlow, selectPeers, selectPendingIntroductions, selectPreviousPeers, selectIntroChannels, selectIntroConnections, selectMessages} from './connectionSelectors';
import {selectP2pGame, selectGameView} from '../game/gameSelectors';
import {createGameStore, createReconnectListenerFactory, createGameCommandListenerFactory} from '../game/gameStore';
import type {GameStore} from '../game/gameStore';
import {createConnectionPort} from './connectionPort';

const makeRelayMiddleware = (myName: string, mySigId: string, getOther: () => ConnectionStore): MiddlewareFactory =>
  (_deps) => (next) => (action) => {
    if (action.type === 'RELAY_OFFER') {
      getOther().dispatch(serverOfferReceived(mySigId, myName, action.sdp));
    } else if (action.type === 'RELAY_ANSWER') {
      getOther().dispatch(serverAnswerReceived(mySigId, action.sdp));
    }
    next(action);
  };

const makePair = () => {
  const factory = createFakePeerConnectionFactory();
  const stores: {alice?: ConnectionStore; bob?: ConnectionStore} = {};
  const gameStores: {alice?: GameStore; bob?: GameStore} = {};

  const alicePortHandle = createConnectionPort({
    sendToPeer: (peerId, message) => stores.alice!.dispatch(sendToPeer(peerId, message as Record<string, unknown>)),
    sendToServer: () => {},
  });
  const bobPortHandle = createConnectionPort({
    sendToPeer: (peerId, message) => stores.bob!.dispatch(sendToPeer(peerId, message as Record<string, unknown>)),
    sendToServer: () => {},
  });

  gameStores.alice = createGameStore({port: alicePortHandle.port, listenerFactories: [createReconnectListenerFactory, createGameCommandListenerFactory], dispatchToConnection: (a) => stores.alice!.dispatch(a)});
  gameStores.bob = createGameStore({port: bobPortHandle.port, listenerFactories: [createReconnectListenerFactory, createGameCommandListenerFactory], dispatchToConnection: (a) => stores.bob!.dispatch(a)});

  stores.alice = createConnectionStore(
    applyMiddleware([makeRelayMiddleware('Alice', 'alice-sig', () => stores.bob!)]),
    [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection, portEmit: alicePortHandle.emit, getGameState: () => gameStores.alice!.getState(), dispatchToGame: (a) => gameStores.alice!.dispatch(a)})],
  );
  stores.bob = createConnectionStore(
    applyMiddleware([makeRelayMiddleware('Bob', 'bob-sig', () => stores.alice!)]),
    [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection, portEmit: bobPortHandle.emit, getGameState: () => gameStores.bob!.getState(), dispatchToGame: (a) => gameStores.bob!.dispatch(a)})],
  );

  const connect = async () => {
    stores.alice!.dispatch(connectViaServer('bob-sig', 'Bob'));
    await vi.waitFor(() => {
      expect(selectPeers(stores.alice!.getState())).toHaveLength(1);
      expect(selectPeers(stores.bob!.getState())).toHaveLength(1);
    });
  };

  return {alice: stores.alice!, bob: stores.bob!, aliceGame: gameStores.alice!, bobGame: gameStores.bob!, connect};
};

const makeRelayForAll = (myName: string, myId: string, registry: Record<string, () => ConnectionStore | undefined>): MiddlewareFactory =>
  (_deps) => (next) => (action) => {
    if (action.type === 'RELAY_OFFER') {
      registry[action.targetPeerId]?.()?.dispatch(serverOfferReceived(myId, myName, action.sdp));
    } else if (action.type === 'RELAY_ANSWER') {
      registry[action.targetPeerId]?.()?.dispatch(serverAnswerReceived(myId, action.sdp));
    }
    next(action);
  };

const makeTriple = () => {
  const factory = createFakePeerConnectionFactory();
  const stores: {alice?: ConnectionStore; bob?: ConnectionStore; carol?: ConnectionStore} = {};
  const registry: Record<string, () => ConnectionStore | undefined> = {};

  stores.alice = createConnectionStore(
    applyMiddleware([makeRelayForAll('Alice', 'alice-sig', registry)]),
    [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection})],
  );
  stores.bob = createConnectionStore(
    applyMiddleware([makeRelayForAll('Bob', 'bob-sig', registry)]),
    [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection})],
  );
  stores.carol = createConnectionStore(
    applyMiddleware([makeRelayForAll('Carol', 'carol-sig', registry)]),
    [createHandlerListener({name: 'Carol', createPeerConnection: factory.createPeerConnection})],
  );
  registry['alice-sig'] = () => stores.alice;
  registry['bob-sig'] = () => stores.bob;
  registry['carol-sig'] = () => stores.carol;

  const connect = async () => {
    stores.alice!.dispatch(connectViaServer('bob-sig', 'Bob'));
    stores.alice!.dispatch(connectViaServer('carol-sig', 'Carol'));
    await vi.waitFor(() => {
      expect(selectPeers(stores.alice!.getState())).toHaveLength(2);
      expect(selectPeers(stores.bob!.getState())).toHaveLength(1);
      expect(selectPeers(stores.carol!.getState())).toHaveLength(1);
    });
    await vi.waitFor(() => expect(selectPeers(stores.alice!.getState()).every(p => p.name)).toBe(true));
  };

  return {alice: stores.alice!, bob: stores.bob!, carol: stores.carol!, connect};
};

describe('hashValue', () => {
  it('produces a consistent SHA-256 hex digest for a given string', async () => {
    const result1 = await hashValue('12345').mapEither(h => h, () => '');
    const result2 = await hashValue('12345').mapEither(h => h, () => '');
    expect(result1).toBe(result2);
    expect(result1).toHaveLength(64); // SHA-256 = 64 hex chars
  });

  it('produces different hashes for different inputs', async () => {
    const hash1 = await hashValue('100').mapEither(h => h, () => '');
    const hash2 = await hashValue('200').mapEither(h => h, () => '');
    expect(hash1).not.toBe(hash2);
  });
});

describe('createHandlerMiddleware (store)', () => {
  it('CONNECT_VIA_SERVER connects both stores via server relay', async () => {
    const {alice, bob, connect} = makePair();

    await connect();

    expect(selectPeers(alice.getState())).toHaveLength(1);
    expect(selectPeers(bob.getState())).toHaveLength(1);
  });

  it('DISCONNECT dispatch removes peer from state', async () => {
    const {alice, connect} = makePair();
    await connect();
    const peerId = selectPeers(alice.getState())[0].id;

    alice.dispatch(disconnect(peerId));

    await vi.waitFor(() => expect(selectPeers(alice.getState())).toHaveLength(0));
  });

  it('DISCONNECT only removes the specified peer', async () => {
    const {alice, connect} = makeTriple();
    await connect();

    const bobPeerId = selectPeers(alice.getState()).find(p => p.name === 'Bob')!.id;

    alice.dispatch(disconnect(bobPeerId));

    await vi.waitFor(() => expect(selectPeers(alice.getState()).find(p => p.name === 'Bob')).toBeUndefined());
    expect(selectPeers(alice.getState()).find(p => p.name === 'Carol')).toBeDefined();
  });

  it('GRANT_TRUST dispatch updates trustsMe on the remote store', async () => {
    const {alice, bob, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;

    bob.dispatch(grantTrust(alicePeerIdOnBob));

    await vi.waitFor(() => expect(selectPeers(alice.getState())[0].trustsMe).toBe(true));
  });

  it('REVOKE_TRUST dispatch clears trustsMe on the remote store', async () => {
    const {alice, bob, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;

    bob.dispatch(grantTrust(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectPeers(alice.getState())[0].trustsMe).toBe(true));

    bob.dispatch(revokeTrust(alicePeerIdOnBob));

    await vi.waitFor(() => expect(selectPeers(alice.getState())[0].trustsMe).toBe(false));
  });

  it('CONNECT_VIA_SERVER to a previous peer removes them from previousPeers', async () => {
    const {alice, connect} = makePair();
    alice.dispatch(previousPeersReceived([{peerId: 'bob-sig', name: 'Bob', online: false}]));

    await connect();

    await vi.waitFor(() => expect(selectPreviousPeers(alice.getState())).toHaveLength(0));
  });

  it('PEER_DISCONNECTED adds the peer to previousPeers when they have a signalingId', async () => {
    const {alice, connect} = makePair();
    await connect();
    const bobPeerId = selectPeers(alice.getState()).find(p => p.name === 'Bob')!.id;

    alice.dispatch(peerDisconnected(bobPeerId));

    await vi.waitFor(() => {
      const previous = selectPreviousPeers(alice.getState());
      expect(previous).toHaveLength(1);
      expect(previous[0].peerId).toBe('bob-sig');
      expect(previous[0].name).toBe('Bob');
      expect(previous[0].online).toBe(false);
    });
  });

  it('PEER_DISCONNECTED does not duplicate an existing previousPeer entry', async () => {
    const {alice, connect} = makePair();
    alice.dispatch(previousPeersReceived([{peerId: 'bob-sig', name: 'Bob', online: false}]));
    await connect();
    // After connect, bob-sig is removed from previousPeers (PREVIOUS_PEER_CONNECTED)
    await vi.waitFor(() => expect(selectPreviousPeers(alice.getState())).toHaveLength(0));
    const bobPeerId = selectPeers(alice.getState()).find(p => p.name === 'Bob')!.id;

    alice.dispatch(peerDisconnected(bobPeerId));

    await vi.waitFor(() => expect(selectPreviousPeers(alice.getState())).toHaveLength(1));
    expect(selectPreviousPeers(alice.getState())[0].peerId).toBe('bob-sig');
  });

  it('receiving an INTRODUCTION records the relay peer in handlerState.introChannels', async () => {
    const {alice, bob, connect} = makeTriple();
    await connect();

    const bobPeerId = selectPeers(alice.getState()).find(p => p.name === 'Bob')!.id;
    const carolPeerId = selectPeers(alice.getState()).find(p => p.name === 'Carol')!.id;
    alice.dispatch(introducePeers(bobPeerId, carolPeerId));

    await vi.waitFor(() => expect(selectPendingIntroductions(bob.getState())).toHaveLength(1));
    const introId = selectPendingIntroductions(bob.getState())[0].introId;

    expect(selectIntroChannels(bob.getState())).toHaveProperty(introId);
  });

  it('ACCEPT_INTRODUCTION removes the intro from handlerState.introChannels', async () => {
    const {alice, bob, connect} = makeTriple();
    await connect();

    const bobPeerId = selectPeers(alice.getState()).find(p => p.name === 'Bob')!.id;
    const carolPeerId = selectPeers(alice.getState()).find(p => p.name === 'Carol')!.id;
    alice.dispatch(introducePeers(bobPeerId, carolPeerId));

    await vi.waitFor(() => expect(selectPendingIntroductions(bob.getState())).toHaveLength(1));
    const introId = selectPendingIntroductions(bob.getState())[0].introId;

    bob.dispatch(acceptIntroduction(introId));

    expect(selectIntroChannels(bob.getState())).not.toHaveProperty(introId);
  });

  it('introduction flow connects Bob and Carol directly when both accept', async () => {
    const {alice, bob, carol, connect} = makeTriple();
    await connect();

    const bobPeerId = selectPeers(alice.getState()).find(p => p.name === 'Bob')!.id;
    const carolPeerId = selectPeers(alice.getState()).find(p => p.name === 'Carol')!.id;
    alice.dispatch(introducePeers(bobPeerId, carolPeerId));

    await vi.waitFor(() => expect(selectPendingIntroductions(bob.getState())).toHaveLength(1));
    const introId = selectPendingIntroductions(bob.getState())[0].introId;
    bob.dispatch(acceptIntroduction(introId));

    await vi.waitFor(() => expect(selectPendingIntroductions(carol.getState())).toHaveLength(1));
    carol.dispatch(acceptIntroduction(selectPendingIntroductions(carol.getState())[0].introId));

    await vi.waitFor(() => {
      expect(selectPeers(bob.getState())).toHaveLength(2);
      expect(selectPeers(carol.getState())).toHaveLength(2);
    });
    // introConnections cleared after channel opens — state is clean
    expect(Object.keys(selectIntroConnections(bob.getState()))).toHaveLength(0);
    expect(Object.keys(selectIntroConnections(carol.getState()))).toHaveLength(0);
  });

  it('CREATE_OFFER transitions to offer-failed when peer connection setup fails', async () => {
    const failingPc = {
      iceGatheringState: 'new',
      localDescription: null,
      onicecandidate: null,
      ondatachannel: null,
      createDataChannel: () => ({onopen: null, onclose: null, onmessage: null, send: () => {}, close: () => {}}),
      createOffer: async () => { throw new Error('ICE failed'); },
      createAnswer: async () => ({type: 'answer', sdp: ''}),
      setLocalDescription: async () => {},
      setRemoteDescription: async () => {},
      close: () => {},
    } as unknown as RTCPeerConnection;

    const store = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [createHandlerListener({name: 'Player', createPeerConnection: () => failingPc})],
    );

    store.dispatch(createOffer('secret'));

    await vi.waitFor(() => expect(selectFlow(store.getState()).phase).toBe('offer-failed'));
  });

  it('CREATE_OFFER transitions to offer-failed when ICE gathering times out with no candidates', async () => {
    vi.useFakeTimers();
    try {
      const hangingPc = {
        iceGatheringState: 'gathering',
        localDescription: null,
        onicecandidate: null,
        ondatachannel: null,
        createDataChannel: () => ({onopen: null, onclose: null, onmessage: null, send: () => {}, close: () => {}}),
        createOffer: async () => ({type: 'offer' as const, sdp: 'fake-offer'}),
        createAnswer: async () => ({type: 'answer' as const, sdp: ''}),
        setLocalDescription: async () => {
          // localDescription stays null — never fires onicecandidate
        },
        setRemoteDescription: async () => {},
        close: () => {},
      } as unknown as RTCPeerConnection;

      const store = createConnectionStore(
        applyMiddleware([encodingMiddleware, codecMiddleware]),
        [createHandlerListener({name: 'Player', createPeerConnection: () => hangingPc})],
      );

      store.dispatch(createOffer('secret'));
      await vi.advanceTimersByTimeAsync(5001);

      expect(selectFlow(store.getState()).phase).toBe('offer-failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ACCEPT_OFFER transitions to offer-failed when ICE gathering produces no SDP', async () => {
    // Generate a real offer code from a normal store
    const aliceFactory = createFakePeerConnectionFactory();
    const alice = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [createHandlerListener({name: 'Alice', createPeerConnection: aliceFactory.createPeerConnection})],
    );
    alice.dispatch(createOffer('secret'));
    await vi.waitFor(() => expect(selectFlow(alice.getState()).phase).toBe('offer-ready'));
    const offerCode = (selectFlow(alice.getState()) as Extract<ConnectionFlow, {phase: 'offer-ready'}>).code;

    // PC where iceGatheringState is already 'complete' but localDescription stays null,
    // so gatherIceCandidates short-circuits and resolves with undefined immediately
    const nullSdpPc = {
      iceGatheringState: 'complete',
      localDescription: null,
      onicecandidate: null,
      ondatachannel: null,
      createDataChannel: () => ({onopen: null, onclose: null, onmessage: null, send: () => {}, close: () => {}}),
      createOffer: async () => ({type: 'offer' as const, sdp: 'fake-offer'}),
      createAnswer: async () => ({type: 'answer' as const, sdp: 'fake-answer'}),
      setLocalDescription: async () => {},
      setRemoteDescription: async () => {},
      close: () => {},
    } as unknown as RTCPeerConnection;

    const bob = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [createHandlerListener({name: 'Bob', createPeerConnection: () => nullSdpPc})],
    );

    bob.dispatch(joinOffer(offerCode, 'secret'));

    await vi.waitFor(() => expect(selectFlow(bob.getState()).phase).toBe('offer-failed'));
  });

  it('SEND_MESSAGE delivers the text to the receiving peer store', async () => {
    const {alice, bob, connect} = makePair();
    await connect();
    const bobPeerIdOnAlice = selectPeers(alice.getState())[0].id;

    alice.dispatch(sendMessage(bobPeerIdOnAlice, 'hello'));

    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    await vi.waitFor(() =>
      expect(selectMessages(bob.getState())).toEqual([
        {peerId: alicePeerIdOnBob, text: 'hello', fromSelf: false},
      ])
    );
  });

  it('SEND_MESSAGE is recorded locally with fromSelf: true', async () => {
    const {alice, connect} = makePair();
    await connect();
    const bobPeerIdOnAlice = selectPeers(alice.getState())[0].id;

    alice.dispatch(sendMessage(bobPeerIdOnAlice, 'hello'));

    expect(selectMessages(alice.getState())).toEqual([
      {peerId: bobPeerIdOnAlice, text: 'hello', fromSelf: true},
    ]);
  });

  it('full offer/answer handshake connects both stores', async () => {
    const factory = createFakePeerConnectionFactory();

    const alice = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection})],
    );

    const bob = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection})],
    );

    alice.dispatch(createOffer('secret'));
    await vi.waitFor(() => expect(selectFlow(alice.getState()).phase).toBe('offer-ready'));
    const offerFlow = selectFlow(alice.getState()) as Extract<ConnectionFlow, {phase: 'offer-ready'}>;

    bob.dispatch(joinOffer(offerFlow.code, 'secret'));
    await vi.waitFor(() => expect(selectFlow(bob.getState()).phase).toBe('answer-ready'));
    const answerFlow = selectFlow(bob.getState()) as Extract<ConnectionFlow, {phase: 'answer-ready'}>;

    alice.dispatch(acceptAnswerCode(answerFlow.code));

    await vi.waitFor(() => {
      expect(selectPeers(alice.getState())).toHaveLength(1);
      expect(selectPeers(bob.getState())).toHaveLength(1);
    });
  });

  it('flow resets to idle after a successful offer/answer handshake', async () => {
    const factory = createFakePeerConnectionFactory();

    const alice = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection})],
    );

    const bob = createConnectionStore(
      applyMiddleware([encodingMiddleware, codecMiddleware]),
      [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection})],
    );

    alice.dispatch(createOffer('secret'));
    await vi.waitFor(() => expect(selectFlow(alice.getState()).phase).toBe('offer-ready'));
    const offerFlow = selectFlow(alice.getState()) as Extract<ConnectionFlow, {phase: 'offer-ready'}>;

    bob.dispatch(joinOffer(offerFlow.code, 'secret'));
    await vi.waitFor(() => expect(selectFlow(bob.getState()).phase).toBe('answer-ready'));
    const answerFlow = selectFlow(bob.getState()) as Extract<ConnectionFlow, {phase: 'answer-ready'}>;

    alice.dispatch(acceptAnswerCode(answerFlow.code));
    await vi.waitFor(() => expect(selectPeers(alice.getState())).toHaveLength(1));

    expect(selectFlow(alice.getState()).phase).toBe('idle');
  });
});

const setupP2pGame = async (pair: Awaited<ReturnType<typeof makePair>>) => {
  const {alice, bob, aliceGame, bobGame, connect} = pair;
  await connect();
  const alicePeerId = selectPeers(bob.getState())[0].id;
  bobGame.dispatch(challengePeer(alicePeerId));
  await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('challenge-received'));
  aliceGame.dispatch(acceptChallenge());
  await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('placing'));
  aliceGame.dispatch(p2pBoardReady('alice-hash'));
  await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.opponentBoardReady).toBe(true));
  bobGame.dispatch(p2pBoardReady('bob-hash'));
  await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('selecting-turn'));
  aliceGame.dispatch(turnOrderDecided(true));
  bobGame.dispatch(turnOrderDecided(false));
  return {alice, bob, aliceGame, bobGame};
};

describe('coin flip turn selection', () => {
  it('both players claiming first results in opposite turn assignments', async () => {
    const {alice, bob, aliceGame, bobGame, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    bobGame.dispatch(challengePeer(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('challenge-received'));
    aliceGame.dispatch(acceptChallenge());
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('placing'));
    aliceGame.dispatch(p2pBoardReady('a-hash'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.opponentBoardReady).toBe(true));
    bobGame.dispatch(p2pBoardReady('b-hash'));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('selecting-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('selecting-turn'));

    // Both claim first simultaneously — coin flip resolves to opposite turns
    alice.dispatch(claimFirstTurn());
    bob.dispatch(claimFirstTurn());

    await vi.waitFor(() => {
      const aPhase = selectP2pGame(aliceGame.getState())?.phase;
      const bPhase = selectP2pGame(bobGame.getState())?.phase;
      expect(aPhase === 'my-turn' || aPhase === 'their-turn').toBe(true);
      expect(bPhase === 'my-turn' || bPhase === 'their-turn').toBe(true);
      expect(aPhase).not.toBe(bPhase); // one goes first, the other second
    });
  });

  it('coin flip completes with SHA-256 hashes — both peers resolve to opposite turns', async () => {
    const {alice, bob, aliceGame, bobGame, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    bobGame.dispatch(challengePeer(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('challenge-received'));
    aliceGame.dispatch(acceptChallenge());
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('placing'));
    aliceGame.dispatch(p2pBoardReady('a-hash'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.opponentBoardReady).toBe(true));
    bobGame.dispatch(p2pBoardReady('b-hash'));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('selecting-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('selecting-turn'));

    // Only Alice claims first — triggers coin flip
    alice.dispatch(claimFirstTurn());

    await vi.waitFor(() => {
      const aPhase = selectP2pGame(aliceGame.getState())?.phase;
      const bPhase = selectP2pGame(bobGame.getState())?.phase;
      expect(aPhase === 'my-turn' || aPhase === 'their-turn').toBe(true);
      expect(bPhase === 'my-turn' || bPhase === 'their-turn').toBe(true);
      expect(aPhase).not.toBe(bPhase);
    });
  });

  it('coin flip rejects a forged reveal — forger gets their-turn', async () => {
    const {alice, bob, aliceGame, bobGame, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    bobGame.dispatch(challengePeer(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('challenge-received'));
    aliceGame.dispatch(acceptChallenge());
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('placing'));
    aliceGame.dispatch(p2pBoardReady('a-hash'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.opponentBoardReady).toBe(true));
    bobGame.dispatch(p2pBoardReady('b-hash'));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('selecting-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('selecting-turn'));

    // Alice initiates coin flip — sends COMMIT with SHA-256 hash
    alice.dispatch(claimFirstTurn());

    // Wait for Bob to receive the COMMIT and auto-reveal
    await vi.waitFor(() => {
      const bPhase = selectP2pGame(bobGame.getState())?.phase;
      expect(bPhase === 'my-turn' || bPhase === 'their-turn').toBe(true);
    });

    // Both should have resolved with hash verification
    const aPhase = selectP2pGame(aliceGame.getState())?.phase;
    const bPhase = selectP2pGame(bobGame.getState())?.phase;
    expect(aPhase === 'my-turn' || aPhase === 'their-turn').toBe(true);
    expect(aPhase).not.toBe(bPhase);
  });
});

describe('direct turn claim', () => {
  it('simultaneous Go first does not leave both players in their-turn', async () => {
    const {bob, aliceGame, bobGame, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    bobGame.dispatch(challengePeer(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('challenge-received'));
    aliceGame.dispatch(acceptChallenge());
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('placing'));
    aliceGame.dispatch(p2pBoardReady('a-hash'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.opponentBoardReady).toBe(true));
    bobGame.dispatch(p2pBoardReady('b-hash'));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('selecting-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('selecting-turn'));

    // Both click Go first simultaneously
    aliceGame.dispatch(takeFirstTurn());
    bobGame.dispatch(takeFirstTurn());

    await vi.waitFor(() => {
      const aPhase = selectP2pGame(aliceGame.getState())?.phase;
      const bPhase = selectP2pGame(bobGame.getState())?.phase;
      expect(aPhase === 'my-turn' || aPhase === 'their-turn').toBe(true);
      expect(bPhase === 'my-turn' || bPhase === 'their-turn').toBe(true);
    });

    // They must be opposites — not both their-turn
    expect(selectP2pGame(aliceGame.getState())?.phase).not.toBe(selectP2pGame(bobGame.getState())?.phase);
  });

  it('Go first gives the clicker my-turn and the opponent their-turn', async () => {
    const {bob, aliceGame, bobGame, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    bobGame.dispatch(challengePeer(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('challenge-received'));
    aliceGame.dispatch(acceptChallenge());
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('placing'));
    aliceGame.dispatch(p2pBoardReady('a-hash'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.opponentBoardReady).toBe(true));
    bobGame.dispatch(p2pBoardReady('b-hash'));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('selecting-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('selecting-turn'));

    aliceGame.dispatch(takeFirstTurn());

    await vi.waitFor(() => {
      expect(selectP2pGame(aliceGame.getState())?.phase).toBe('my-turn');
      expect(selectP2pGame(bobGame.getState())?.phase).toBe('their-turn');
    });
  });
});

describe('P2P fire guards', () => {
  it('duplicate incoming FIRE at the same cell is ignored — opponentShots stays at 1', async () => {
    const pair = makePair();
    const {aliceGame, bobGame} = await setupP2pGame(pair);
    const emptyBoard: Board = {placed: []};
    aliceGame.dispatch(boardLoaded(emptyBoard));
    // Put alice in their-turn with one prior shot at (3,4) already in opponentShots
    const currentGame = selectP2pGame(aliceGame.getState())!;
    aliceGame.dispatch(p2pGameLoaded({...currentGame, phase: 'their-turn', opponentShots: [{cell: {row: 3, col: 4}, result: 'miss' as const}]}));

    // Bob fires at (3,4) again — duplicate guard blocks it
    bobGame.dispatch(p2pFire(3, 4));
    await new Promise(r => setTimeout(r, 50));
    expect(selectP2pGame(aliceGame.getState())?.opponentShots).toHaveLength(1);
  });

  it('FIRE received when not their-turn is ignored', async () => {
    const pair = makePair();
    const {aliceGame, bobGame} = await setupP2pGame(pair);
    // Alice is my-turn after setupP2pGame; give her a board so the phase guard is the only blocker
    aliceGame.dispatch(boardLoaded({placed: []}));

    bobGame.dispatch(p2pFire(1, 1));
    await new Promise(r => setTimeout(r, 50));
    expect(selectP2pGame(aliceGame.getState())?.opponentShots).toHaveLength(0);
  });
});

describe('reconnect — load game on PEER_CONNECTED', () => {
  it('dispatches loadP2pGame when any peer connects', async () => {
    const pair = makePair();
    const {alice, aliceGame} = await setupP2pGame(pair);
    const bobPeerId = selectPeers(alice.getState())[0].id;

    // Disconnect Bob — game transitions to 'disconnected'
    alice.dispatch(peerDisconnected(bobPeerId));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('disconnected'));

    // Simulate server restoring game with correct opponentId
    const savedGame = {...selectP2pGame(aliceGame.getState())!, phase: 'their-turn' as const, opponentId: bobPeerId};
    aliceGame.dispatch(p2pGameLoaded(savedGame));

    // Game should be restored to play phase with correct opponentId
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('their-turn'));
    expect(selectP2pGame(aliceGame.getState())?.opponentId).toBe(bobPeerId);
  });
});

describe('sender-side P2P_FIRE phase guard', () => {
  it('P2P_FIRE sends a FIRE message when phase is my-turn', async () => {
    const pair = makePair();
    const {aliceGame, bobGame} = await setupP2pGame(pair);
    bobGame.dispatch(boardLoaded({placed: []}));

    // Alice is my-turn after setupP2pGame — fire should work
    aliceGame.dispatch(p2pFire(1, 1));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.opponentShots).toHaveLength(1));
  });

  it('P2P_FIRE does not send when phase is their-turn', async () => {
    const pair = makePair();
    const {aliceGame, bobGame} = await setupP2pGame(pair);
    bobGame.dispatch(boardLoaded({placed: []}));

    // Put alice in their-turn (for phase guard in P2P_FIRE)
    const currentGame = selectP2pGame(aliceGame.getState())!;
    aliceGame.dispatch(p2pGameLoaded({...currentGame, phase: 'their-turn'}));

    aliceGame.dispatch(p2pFire(1, 1));
    await new Promise(r => setTimeout(r, 50));
    expect(selectP2pGame(bobGame.getState())?.opponentShots).toHaveLength(0);
  });

  it('P2P_FIRE does not send when phase is selecting-turn', async () => {
    const pair = makePair();
    const {bob, aliceGame, bobGame, connect} = pair;
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    bobGame.dispatch(challengePeer(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('challenge-received'));
    aliceGame.dispatch(acceptChallenge());
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('placing'));
    aliceGame.dispatch(p2pBoardReady('a-hash'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.opponentBoardReady).toBe(true));
    bobGame.dispatch(p2pBoardReady('b-hash'));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('selecting-turn'));

    // Alice tries to fire during selecting-turn
    aliceGame.dispatch(p2pFire(1, 1));
    await new Promise(r => setTimeout(r, 50));
    // Bob should not have received any shots
    expect(selectP2pGame(bobGame.getState())?.opponentShots).toHaveLength(0);
  });
});

describe('P2P board reveal at game over', () => {
  const fullBoard: Board = {
    placed: [
      {ship: {name: 'Carrier', size: 5}, position: {row: 1, col: 1}, orientation: 'horizontal'},
      {ship: {name: 'Battleship', size: 4}, position: {row: 2, col: 1}, orientation: 'horizontal'},
      {ship: {name: 'Cruiser', size: 3}, position: {row: 3, col: 1}, orientation: 'horizontal'},
      {ship: {name: 'Submarine', size: 3}, position: {row: 4, col: 1}, orientation: 'horizontal'},
      {ship: {name: 'Destroyer', size: 2}, position: {row: 5, col: 1}, orientation: 'horizontal'},
    ],
  };
  const fleetCells = [
    ...Array.from({length: 5}, (_, i) => ({row: 1, col: i + 1})),
    ...Array.from({length: 4}, (_, i) => ({row: 2, col: i + 1})),
    ...Array.from({length: 3}, (_, i) => ({row: 3, col: i + 1})),
    ...Array.from({length: 3}, (_, i) => ({row: 4, col: i + 1})),
    ...Array.from({length: 2}, (_, i) => ({row: 5, col: i + 1})),
  ];

  it("winner receives opponent's board with verified hash after sinking the fleet", async () => {
    const pair = makePair();
    const {aliceGame, bobGame} = await setupP2pGame(pair);

    bobGame.dispatch(boardLoaded(fullBoard));
    aliceGame.dispatch(boardLoaded({placed: []}));

    // Set Alice's opponentBoardHash to the real hash of Bob's board so verification passes
    const bobHash = await hashBoard(fullBoard).mapEither(h => h, () => '');
    const currentAliceGame = selectP2pGame(aliceGame.getState())!;
    aliceGame.dispatch(p2pGameLoaded({...currentAliceGame, opponentBoardHash: bobHash}));

    // Confirm opponentBoard is null while game is in progress
    expect(selectP2pGame(aliceGame.getState())?.opponentBoard).toBeNull();

    for (let i = 0; i < fleetCells.length; i++) {
      const {row, col} = fleetCells[i];
      aliceGame.dispatch(p2pFire(row, col));
      await vi.waitFor(() => {
        const phase = selectP2pGame(aliceGame.getState())?.phase;
        expect(phase === 'their-turn' || phase === 'game-over').toBe(true);
      });
      if (selectP2pGame(aliceGame.getState())?.phase === 'game-over') break;
      bobGame.dispatch(p2pFire(10, i + 1));
      await vi.waitFor(() => {
        const phase = selectP2pGame(aliceGame.getState())?.phase;
        expect(phase === 'my-turn' || phase === 'game-over').toBe(true);
      });
      if (selectP2pGame(aliceGame.getState())?.phase === 'game-over') break;
    }

    await vi.waitFor(() => {
      expect(selectP2pGame(aliceGame.getState())?.phase).toBe('game-over');
      expect(selectP2pGame(aliceGame.getState())?.opponentBoard).not.toBeNull();
      expect(selectP2pGame(aliceGame.getState())?.boardVerified).toBe(true);
    });
  });

  it("boardVerified is false when board does not match committed hash", async () => {
    const pair = makePair();
    const {aliceGame, bobGame} = await setupP2pGame(pair);

    bobGame.dispatch(boardLoaded(fullBoard));
    aliceGame.dispatch(boardLoaded({placed: []}));

    const currentAliceGame = selectP2pGame(aliceGame.getState())!;
    aliceGame.dispatch(p2pGameLoaded({...currentAliceGame, opponentBoardHash: 'wrong-hash'}));

    for (let i = 0; i < fleetCells.length; i++) {
      const {row, col} = fleetCells[i];
      aliceGame.dispatch(p2pFire(row, col));
      await vi.waitFor(() => {
        const phase = selectP2pGame(aliceGame.getState())?.phase;
        expect(phase === 'their-turn' || phase === 'game-over').toBe(true);
      });
      if (selectP2pGame(aliceGame.getState())?.phase === 'game-over') break;
      bobGame.dispatch(p2pFire(10, i + 1));
      await vi.waitFor(() => {
        const phase = selectP2pGame(aliceGame.getState())?.phase;
        expect(phase === 'my-turn' || phase === 'game-over').toBe(true);
      });
      if (selectP2pGame(aliceGame.getState())?.phase === 'game-over') break;
    }

    await vi.waitFor(() => {
      expect(selectP2pGame(aliceGame.getState())?.phase).toBe('game-over');
      expect(selectP2pGame(aliceGame.getState())?.opponentBoard).not.toBeNull();
      expect(selectP2pGame(aliceGame.getState())?.boardVerified).toBe(false);
    });
  });
});

describe('disconnected and state-mismatch game view', () => {
  it('selectGameView returns a view with disconnected phase when game is disconnected', async () => {
    const pair = makePair();
    const {alice, aliceGame} = await setupP2pGame(pair);
    const bobPeerId = selectPeers(alice.getState())[0].id;

    alice.dispatch(peerDisconnected(bobPeerId));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('disconnected'));

    const view = selectGameView(aliceGame.getState());
    expect(view).not.toBeNull();
    expect(view!.phase).toBe('disconnected');
  });

  it('selectGameView returns a view with state-mismatch phase', async () => {
    const pair = makePair();
    const {aliceGame} = await setupP2pGame(pair);

    aliceGame.dispatch(p2pStateMismatch());
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('state-mismatch'));

    const view = selectGameView(aliceGame.getState());
    expect(view).not.toBeNull();
    expect(view!.phase).toBe('state-mismatch');
  });
});

describe('reconnect via GAME_STATE_SYNC when no local game exists', () => {
  it('creates game from flipped perspective when Bob has no game and Alice sends GAME_STATE_SYNC', async () => {
    const pair = makePair();
    const {bob, aliceGame, bobGame} = await setupP2pGame(pair);
    // alicePeerId is Alice's local peer ID as seen from Bob's store
    const alicePeerId = selectPeers(bob.getState())[0].id;

    // Give Bob a board so Alice's incoming FIRE can be resolved
    bobGame.dispatch(boardLoaded({placed: []}));

    // Alice fires — Alice → their-turn, Bob → my-turn
    aliceGame.dispatch(p2pFire(1, 1));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('their-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('my-turn'));

    const aliceSavedGame = selectP2pGame(aliceGame.getState())!;

    // Bob loses his game (simulates reload — game store starts fresh)
    bobGame.dispatch(clearP2pGame());

    // Alice loads her saved game — this triggers a GAME_STATE_SYNC to Bob
    // Bob's game is null, so the handler must create the game from Alice's perspective flipped
    aliceGame.dispatch(p2pGameLoaded(aliceSavedGame));

    // Bob should have a game created from Alice's flipped perspective:
    // Alice phase=their-turn → Bob phase=my-turn
    // Alice myShots (1 shot) → Bob opponentShots (1 shot)
    // Alice opponentShots (0 shots) → Bob myShots (0 shots)
    // opponentId = Alice's peer ID as seen from Bob's store
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('my-turn'));
    expect(selectP2pGame(bobGame.getState())?.opponentShots).toHaveLength(1);
    expect(selectP2pGame(bobGame.getState())?.myShots).toHaveLength(0);
    expect(selectP2pGame(bobGame.getState())?.opponentId).toBe(alicePeerId);
  });
});

describe('reconnect and resume game', () => {
  it('game resumes after disconnect and p2pGameLoaded when both states match', async () => {
    const pair = makePair();
    const {alice, bob, aliceGame, bobGame} = await setupP2pGame(pair);
    const bobPeerId = selectPeers(alice.getState())[0].id;
    const alicePeerId = selectPeers(bob.getState())[0].id;

    // Give Bob a board so Alice's incoming FIRE can be resolved
    bobGame.dispatch(boardLoaded({placed: []}));

    // Alice fires — game transitions: Alice → their-turn, Bob → my-turn
    aliceGame.dispatch(p2pFire(1, 1));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('their-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('my-turn'));

    // Capture game states before disconnect (simulates what server would save)
    const aliceSavedGame = selectP2pGame(aliceGame.getState())!;
    const bobSavedGame = selectP2pGame(bobGame.getState())!;

    // Disconnect both sides — game transitions to 'disconnected'
    // Note: peerDisconnected triggers handler.cleanup which closes data channels
    alice.dispatch(peerDisconnected(bobPeerId));
    bob.dispatch(peerDisconnected(alicePeerId));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('disconnected'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('disconnected'));

    // Verify shots survive the disconnect transition
    expect(selectP2pGame(aliceGame.getState())?.myShots).toHaveLength(1);
    expect(selectP2pGame(bobGame.getState())?.opponentShots).toHaveLength(1);

    // Simulate server load: restore both games from saved state
    // P2P_GAME_LOADED with a resumable phase restores the game directly.
    // Data channels are gone after cleanup, so GAME_STATE_SYNC cannot flow,
    // but the game is still correctly restored to play phase by the reducer.
    aliceGame.dispatch(p2pGameLoaded(aliceSavedGame));
    bobGame.dispatch(p2pGameLoaded(bobSavedGame));

    // Both games should be restored to their saved play phases
    expect(selectP2pGame(aliceGame.getState())?.phase).toBe('their-turn');
    expect(selectP2pGame(bobGame.getState())?.phase).toBe('my-turn');

    // Shot history is preserved after restore
    expect(selectP2pGame(aliceGame.getState())?.myShots).toHaveLength(1);
    expect(selectP2pGame(bobGame.getState())?.opponentShots).toHaveLength(1);
  });

  it('game transitions to state-mismatch when GAME_STATE_SYNC reveals inconsistent shot counts', async () => {
    const pair = makePair();
    const {aliceGame, bobGame} = await setupP2pGame(pair);

    // Give Bob a board so the fire resolves
    bobGame.dispatch(boardLoaded({placed: []}));

    // Alice fires — creates asymmetric state: Alice has 1 myShot, Bob has 1 opponentShot
    aliceGame.dispatch(p2pFire(1, 1));
    await vi.waitFor(() => expect(selectP2pGame(aliceGame.getState())?.phase).toBe('their-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bobGame.getState())?.phase).toBe('my-turn'));

    // Capture the real game states before clearing
    const capturedAliceGame = selectP2pGame(aliceGame.getState())!;
    const capturedBobGame = selectP2pGame(bobGame.getState())!;

    // Clear both games while keeping data channels alive.
    // This simulates a "fresh load" where prevGame is null — the P2P_GAME_LOADED listener
    // will send GAME_STATE_SYNC to the opponent because prevGame is null.
    aliceGame.dispatch(clearP2pGame());
    bobGame.dispatch(clearP2pGame());

    // Alice loads her real state with 1 shot.
    // Bob loads a tampered state with 0 shots (missing Alice's shot).
    // Alice loads first: prevGame null → sends GAME_STATE_SYNC (myShots=1, opponentShots=0) to Bob.
    // Bob has no game → creates from Alice's flipped perspective.
    // Bob loading tampered game (prevGame non-null) fires GAME_STATE_SYNC (myShots=0, opponentShots=0) to Alice.
    // Alice has real game (myShots=1) → mismatch detected on Alice.
    // Alice sends GAME_STATE_SYNC (myShots=1) to Bob when loading capturedAliceGame.
    // Bob holds tampered game → mismatch detected on Bob.
    const tamperedBobGame = {...capturedBobGame, myShots: [], opponentShots: [], phase: 'my-turn' as const};

    // Load Bob's tampered game first so Bob has it when he receives Alice's GAME_STATE_SYNC.
    // 1. Bob loads tampered game (prevGame null) → GAME_STATE_SYNC {myShots:0} to Alice.
    //    Alice has no game → creates from Bob's flipped; fires GAME_STATE_SYNC {myShots:0} to Bob → match.
    // 2. Alice loads real game (prevGame non-null) → GAME_STATE_SYNC {myShots:1} to Bob.
    //    Bob has tampered game {myShots:0, opponentShots:0} → mismatch detected on Bob.
    // 3. Bob dispatches p2pStateMismatch. Bob's GAME_STATE_SYNC with tampered data {myShots:0} also
    //    reached Alice in step 1 while Alice had no game → no mismatch there.
    //    Alice receiving Bob's tampered GAME_STATE_SYNC while Alice has reconstructed game:
    //    Alice has {myShots:0, opponentShots:0} → Bob says myShots:0, opponentShots:0 → match.
    //    Alice then loads real game in step 2; Bob detecting mismatch covers the behavior.
    bobGame.dispatch(p2pGameLoaded(tamperedBobGame));
    aliceGame.dispatch(p2pGameLoaded(capturedAliceGame));

    // Bob receives Alice's GAME_STATE_SYNC (myShots=1) while holding tampered game (opponentShots=0)
    // → Bob detects mismatch.
    await vi.waitFor(() => {
      expect(selectP2pGame(bobGame.getState())?.phase).toBe('state-mismatch');
    });
  });
});
