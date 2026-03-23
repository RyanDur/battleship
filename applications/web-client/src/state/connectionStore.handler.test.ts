import {createConnectionStore, createHandlerListener, encodingMiddleware, codecMiddleware, applyMiddleware} from './connectionStore';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {ConnectionStore, MiddlewareFactory} from './connectionStore';
import type {ConnectionFlow} from './connections';
import {serverOfferReceived, serverAnswerReceived, connectViaServer, disconnect, introducePeers, acceptIntroduction, previousPeersReceived, grantTrust, revokeTrust, createOffer, joinOffer, acceptAnswerCode, sendMessage, challengePeer, acceptChallenge, p2pBoardReady, turnOrderDecided, claimFirstTurn, takeFirstTurn, boardLoaded, p2pGameLoaded, p2pFire} from './connectionActions';
import type {Board} from '../game/board';
import {selectFlow, selectPeers, selectPendingIntroductions, selectPreviousPeers, selectIntroChannels, selectIntroConnections, selectMessages, selectP2pGame} from './connectionSelectors';

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

  stores.alice = createConnectionStore(
    applyMiddleware([makeRelayMiddleware('Alice', 'alice-sig', () => stores.bob!)]),
    [createHandlerListener({name: 'Alice', createPeerConnection: factory.createPeerConnection})],
  );

  stores.bob = createConnectionStore(
    applyMiddleware([makeRelayMiddleware('Bob', 'bob-sig', () => stores.alice!)]),
    [createHandlerListener({name: 'Bob', createPeerConnection: factory.createPeerConnection})],
  );

  const connect = async () => {
    stores.alice!.dispatch(connectViaServer('bob-sig', 'Bob'));
    await vi.waitFor(() => {
      expect(selectPeers(stores.alice!.getState())).toHaveLength(1);
      expect(selectPeers(stores.bob!.getState())).toHaveLength(1);
    });
  };

  return {alice: stores.alice!, bob: stores.bob!, connect};
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
  const {alice, bob, connect} = pair;
  await connect();
  const alicePeerId = selectPeers(bob.getState())[0].id;
  bob.dispatch(challengePeer(alicePeerId));
  await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('challenge-received'));
  alice.dispatch(acceptChallenge());
  await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('placing'));
  alice.dispatch(p2pBoardReady('alice-hash'));
  await vi.waitFor(() => expect(selectP2pGame(bob.getState())?.opponentBoardReady).toBe(true));
  bob.dispatch(p2pBoardReady('bob-hash'));
  await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('selecting-turn'));
  alice.dispatch(turnOrderDecided(true));
  bob.dispatch(turnOrderDecided(false));
  return {alice, bob};
};

describe('coin flip turn selection', () => {
  it('both players claiming first results in opposite turn assignments', async () => {
    const {alice, bob, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    bob.dispatch(challengePeer(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('challenge-received'));
    alice.dispatch(acceptChallenge());
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('placing'));
    alice.dispatch(p2pBoardReady('a-hash'));
    await vi.waitFor(() => expect(selectP2pGame(bob.getState())?.opponentBoardReady).toBe(true));
    bob.dispatch(p2pBoardReady('b-hash'));
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('selecting-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bob.getState())?.phase).toBe('selecting-turn'));

    // Both claim first simultaneously — coin flip resolves to opposite turns
    alice.dispatch(claimFirstTurn());
    bob.dispatch(claimFirstTurn());

    await vi.waitFor(() => {
      const aPhase = selectP2pGame(alice.getState())?.phase;
      const bPhase = selectP2pGame(bob.getState())?.phase;
      expect(aPhase === 'my-turn' || aPhase === 'their-turn').toBe(true);
      expect(bPhase === 'my-turn' || bPhase === 'their-turn').toBe(true);
    });

    const aPhase = selectP2pGame(alice.getState())?.phase;
    const bPhase = selectP2pGame(bob.getState())?.phase;
    expect(aPhase).not.toBe(bPhase); // one goes first, the other second
  });
});

describe('direct turn claim', () => {
  it('Go first gives the clicker my-turn and the opponent their-turn', async () => {
    const {alice, bob, connect} = makePair();
    await connect();
    const alicePeerIdOnBob = selectPeers(bob.getState())[0].id;
    bob.dispatch(challengePeer(alicePeerIdOnBob));
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('challenge-received'));
    alice.dispatch(acceptChallenge());
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('placing'));
    alice.dispatch(p2pBoardReady('a-hash'));
    await vi.waitFor(() => expect(selectP2pGame(bob.getState())?.opponentBoardReady).toBe(true));
    bob.dispatch(p2pBoardReady('b-hash'));
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('selecting-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bob.getState())?.phase).toBe('selecting-turn'));

    alice.dispatch(takeFirstTurn());

    await vi.waitFor(() => {
      expect(selectP2pGame(alice.getState())?.phase).toBe('my-turn');
      expect(selectP2pGame(bob.getState())?.phase).toBe('their-turn');
    });
  });
});

describe('P2P fire guards', () => {
  it('duplicate incoming FIRE at the same cell is ignored — opponentShots stays at 1', async () => {
    const pair = makePair();
    const {alice, bob} = await setupP2pGame(pair);
    const emptyBoard: Board = {placed: []};
    alice.dispatch(boardLoaded(emptyBoard));
    // Put alice in their-turn with one prior shot at (3,4) already in opponentShots
    const currentGame = selectP2pGame(alice.getState())!;
    alice.dispatch(p2pGameLoaded({...currentGame, phase: 'their-turn', opponentShots: [{cell: {row: 3, col: 4}, result: 'miss' as const}]}));

    // Bob fires at (3,4) again — duplicate guard blocks it
    bob.dispatch(p2pFire(3, 4));
    await new Promise(r => setTimeout(r, 50));
    expect(selectP2pGame(alice.getState())?.opponentShots).toHaveLength(1);
  });

  it('FIRE received when not their-turn is ignored', async () => {
    const pair = makePair();
    const {alice, bob} = await setupP2pGame(pair);
    // Alice is my-turn after setupP2pGame; give her a board so the phase guard is the only blocker
    alice.dispatch(boardLoaded({placed: []}));

    bob.dispatch(p2pFire(1, 1));
    await new Promise(r => setTimeout(r, 50));
    expect(selectP2pGame(alice.getState())?.opponentShots).toHaveLength(0);
  });
});
