import {createPeerHandler} from './connection.handler';
import {createFakePeerConnectionFactory} from '../test/fakePeerConnection';
import type {PeerEvent} from '../types/worker-messages';

const makeHandler = (name: string, createPeerConnection: () => RTCPeerConnection) => {
  const events: PeerEvent[] = [];
  const {handleCommand} = createPeerHandler({name, emit: e => events.push(e), createPeerConnection});
  return {handleCommand, events};
};

type Handler = ReturnType<typeof makeHandler>

const connectPeers = async (offerer: Handler, answerer: Handler) => {
  const priorOffers = offerer.events.filter(e => e.type === 'OFFER_CREATED').length;
  const priorAnswers = answerer.events.filter(e => e.type === 'ANSWER_CREATED').length;
  const priorOffererConns = offerer.events.filter(e => e.type === 'PEER_CONNECTED').length;
  const priorAnswererConns = answerer.events.filter(e => e.type === 'PEER_CONNECTED').length;

  offerer.handleCommand({type: 'CREATE_OFFER'});

  await vi.waitFor(() =>
    expect(offerer.events.filter(e => e.type === 'OFFER_CREATED').length).toBeGreaterThan(priorOffers)
  );
  const offer = offerer.events.filter(e => e.type === 'OFFER_CREATED')[priorOffers] as {peerId: string; sdp: string};

  answerer.handleCommand({type: 'ACCEPT_OFFER', sdp: offer.sdp});

  await vi.waitFor(() =>
    expect(answerer.events.filter(e => e.type === 'ANSWER_CREATED').length).toBeGreaterThan(priorAnswers)
  );
  const answer = answerer.events.filter(e => e.type === 'ANSWER_CREATED')[priorAnswers] as {peerId: string; sdp: string};

  offerer.handleCommand({type: 'ACCEPT_ANSWER', peerId: offer.peerId, sdp: answer.sdp});

  await vi.waitFor(() => {
    expect(offerer.events.filter(e => e.type === 'PEER_CONNECTED').length).toBeGreaterThan(priorOffererConns);
    expect(answerer.events.filter(e => e.type === 'PEER_CONNECTED').length).toBeGreaterThan(priorAnswererConns);
  });

  return {offererPeerId: offer.peerId, answererPeerId: answer.peerId, offerSdp: offer.sdp};
};

describe('Peer Handler', () => {
  describe('creating an offer', () => {
    it('emits OFFER_CREATED with peerId and SDP when ICE gathering completes', async () => {
      const {createPeerConnection} = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', createPeerConnection);

      alice.handleCommand({type: 'CREATE_OFFER'});

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual(
          expect.objectContaining({type: 'OFFER_CREATED', sdp: expect.any(String)})
        )
      );
      const event = alice.events.find(e => e.type === 'OFFER_CREATED') as {peerId: string};
      expect(typeof event.peerId).toBe('string');
    });

    it('two simultaneous offers get unique peer IDs', async () => {
      const {createPeerConnection} = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', createPeerConnection);

      alice.handleCommand({type: 'CREATE_OFFER'});
      alice.handleCommand({type: 'CREATE_OFFER'});

      await vi.waitFor(() =>
        expect(alice.events.filter(e => e.type === 'OFFER_CREATED')).toHaveLength(2)
      );

      const [first, second] = alice.events.filter(e => e.type === 'OFFER_CREATED') as Array<{peerId: string}>;
      expect(first.peerId).not.toBe(second.peerId);
    });
  });

  describe('connecting peers', () => {
    it('both peers emit PEER_CONNECTED after completing the SDP exchange', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      await connectPeers(alice, bob);

      expect(alice.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTED'}));
      expect(bob.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTED'}));
    });

    it('peers learn each other\'s names after connecting', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offererPeerId, answererPeerId} = await connectPeers(alice, bob);

      await vi.waitFor(() => {
        expect(alice.events).toContainEqual({type: 'PEER_NAMED', peerId: offererPeerId, name: 'Bob'});
        expect(bob.events).toContainEqual({type: 'PEER_NAMED', peerId: answererPeerId, name: 'Alice'});
      });
    });

    it('closing a channel emits PEER_DISCONNECTED on the remote side', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offererPeerId} = await connectPeers(alice, bob);
      const aliceViewedByBob = (bob.events.find(e => e.type === 'PEER_CONNECTED') as {peerId: string}).peerId;

      bob.handleCommand({type: 'DISCONNECT', peerId: aliceViewedByBob});

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual({type: 'PEER_DISCONNECTED', peerId: offererPeerId})
      );
    });

    it('DISCONNECT closes only the specified peer connection', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);
      const carol = makeHandler('Carol', factory.createPeerConnection);

      const {offererPeerId: aliceBobPeerId} = await connectPeers(alice, bob);
      await connectPeers(alice, carol);

      alice.handleCommand({type: 'DISCONNECT', peerId: aliceBobPeerId});

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual({type: 'PEER_DISCONNECTED', peerId: aliceBobPeerId})
      );
      expect(alice.events.filter(e => e.type === 'PEER_DISCONNECTED')).toHaveLength(1);
    });
  });

  describe('name exchange', () => {
    it('logs a warning when a peer sends malformed JSON', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offerSdp} = await connectPeers(alice, bob);

      // Deliver malformed data directly into Alice's channel (answerer side of Alice's offer)
      const answererCh = factory.getAnswererChannel(offerSdp)!;
      answererCh.onmessage?.({data: 'not-valid-json'});

      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('trust', () => {
    it('granting trust causes the remote peer to emit PEER_TRUST_UPDATED with trusts:true', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offererPeerId} = await connectPeers(alice, bob);
      const aliceViewedByBob = (bob.events.find(e => e.type === 'PEER_CONNECTED') as {peerId: string}).peerId;

      alice.handleCommand({type: 'GRANT_TRUST', peerId: offererPeerId});

      await vi.waitFor(() =>
        expect(bob.events).toContainEqual({type: 'PEER_TRUST_UPDATED', peerId: aliceViewedByBob, trusts: true})
      );
    });

    it('revoking trust causes the remote peer to emit PEER_TRUST_UPDATED with trusts:false', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offererPeerId} = await connectPeers(alice, bob);
      const aliceViewedByBob = (bob.events.find(e => e.type === 'PEER_CONNECTED') as {peerId: string}).peerId;

      alice.handleCommand({type: 'REVOKE_TRUST', peerId: offererPeerId});

      await vi.waitFor(() =>
        expect(bob.events).toContainEqual({type: 'PEER_TRUST_UPDATED', peerId: aliceViewedByBob, trusts: false})
      );
    });
  });

  describe('introductions', () => {
    const setupIntroduction = async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);
      const carol = makeHandler('Carol', factory.createPeerConnection);

      const {offererPeerId: aliceBobPeerId} = await connectPeers(alice, bob);
      const {offererPeerId: aliceCarolPeerId} = await connectPeers(alice, carol);

      await vi.waitFor(() =>
        expect(alice.events.filter(e => e.type === 'PEER_NAMED')).toHaveLength(2)
      );

      return {factory, alice, bob, carol, aliceBobPeerId, aliceCarolPeerId};
    };

    it('both parties receive INTRODUCTION_RECEIVED with correct from/peer names', async () => {
      const {alice, bob, carol, aliceBobPeerId, aliceCarolPeerId} = await setupIntroduction();

      alice.handleCommand({type: 'INTRODUCE_PEERS', peerId1: aliceBobPeerId, peerId2: aliceCarolPeerId});

      await vi.waitFor(() => {
        expect(bob.events).toContainEqual(
          expect.objectContaining({type: 'INTRODUCTION_RECEIVED', from: 'Alice', peer: 'Carol'})
        );
        expect(carol.events).toContainEqual(
          expect.objectContaining({type: 'INTRODUCTION_RECEIVED', from: 'Alice', peer: 'Bob'})
        );
      });
    });

    it('when one party declines, the other receives INTRODUCTION_DECLINED', async () => {
      const {alice, bob, carol, aliceBobPeerId, aliceCarolPeerId} = await setupIntroduction();

      alice.handleCommand({type: 'INTRODUCE_PEERS', peerId1: aliceBobPeerId, peerId2: aliceCarolPeerId});

      await vi.waitFor(() =>
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'INTRODUCTION_RECEIVED'}))
      );
      const introId = (bob.events.find(e => e.type === 'INTRODUCTION_RECEIVED') as {introId: string}).introId;

      bob.handleCommand({type: 'DECLINE_INTRODUCTION', introId});

      await vi.waitFor(() =>
        expect(carol.events).toContainEqual({type: 'INTRODUCTION_DECLINED', introId})
      );
    });

    it('when neither accepts within 60 seconds, both receive INTRODUCTION_EXPIRED', async () => {
      const {alice, bob, carol, aliceBobPeerId, aliceCarolPeerId} = await setupIntroduction();

      vi.useFakeTimers();

      alice.handleCommand({type: 'INTRODUCE_PEERS', peerId1: aliceBobPeerId, peerId2: aliceCarolPeerId});
      await Promise.resolve();  // flush INTRODUCTION delivery microtasks

      const introId = (bob.events.find(e => e.type === 'INTRODUCTION_RECEIVED') as {introId: string}).introId;

      vi.advanceTimersByTime(60000);
      await Promise.resolve();  // flush INTRODUCTION_EXPIRED delivery microtasks

      expect(bob.events).toContainEqual({type: 'INTRODUCTION_EXPIRED', introId});
      expect(carol.events).toContainEqual({type: 'INTRODUCTION_EXPIRED', introId});

      vi.useRealTimers();
    });

    it('when a peer disconnects during a pending introduction, the other party receives INTRODUCTION_DECLINED', async () => {
      const {alice, bob, carol, aliceBobPeerId, aliceCarolPeerId} = await setupIntroduction();

      alice.handleCommand({type: 'INTRODUCE_PEERS', peerId1: aliceBobPeerId, peerId2: aliceCarolPeerId});
      await vi.waitFor(() =>
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'INTRODUCTION_RECEIVED'}))
      );

      const bobAlicePeerId = (bob.events.find(e => e.type === 'PEER_CONNECTED') as {peerId: string}).peerId;
      bob.handleCommand({type: 'DISCONNECT', peerId: bobAlicePeerId});

      await vi.waitFor(() =>
        expect(carol.events).toContainEqual(expect.objectContaining({type: 'INTRODUCTION_DECLINED'}))
      );
    });

    it('does nothing when a peer is unknown', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offererPeerId: aliceBobPeerId} = await connectPeers(alice, bob);
      await vi.waitFor(() => expect(alice.events).toContainEqual(expect.objectContaining({type: 'PEER_NAMED'})));

      alice.handleCommand({type: 'INTRODUCE_PEERS', peerId1: aliceBobPeerId, peerId2: 'nonexistent-peer-id'});
      await Promise.resolve();

      expect(bob.events).not.toContainEqual(expect.objectContaining({type: 'INTRODUCTION_RECEIVED'}));
    });

    it('when both accept, Bob and Carol end up directly connected to each other', async () => {
      const {alice, bob, carol, aliceBobPeerId, aliceCarolPeerId} = await setupIntroduction();

      alice.handleCommand({type: 'INTRODUCE_PEERS', peerId1: aliceBobPeerId, peerId2: aliceCarolPeerId});

      await vi.waitFor(() => {
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'INTRODUCTION_RECEIVED'}));
        expect(carol.events).toContainEqual(expect.objectContaining({type: 'INTRODUCTION_RECEIVED'}));
      });
      const introId = (bob.events.find(e => e.type === 'INTRODUCTION_RECEIVED') as {introId: string}).introId;

      bob.handleCommand({type: 'ACCEPT_INTRODUCTION', introId});
      carol.handleCommand({type: 'ACCEPT_INTRODUCTION', introId});

      await vi.waitFor(() => {
        expect(bob.events.filter(e => e.type === 'PEER_CONNECTED')).toHaveLength(2);
        expect(carol.events.filter(e => e.type === 'PEER_CONNECTED')).toHaveLength(2);
      });
    });
  });

  describe('ICE restart', () => {
    const connectPeersViaServer = async (alice: Handler, bob: Handler, aliceSigId: string, bobSigId: string) => {
      alice.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: bobSigId, name: 'Bob'});

      await vi.waitFor(() => expect(alice.events).toContainEqual(
        expect.objectContaining({type: 'SERVER_OFFER_CREATED', signalingPeerId: bobSigId})
      ));
      const offerEvent = alice.events.find(e => e.type === 'SERVER_OFFER_CREATED' && (e as {signalingPeerId: string}).signalingPeerId === bobSigId) as {sdp: string};

      bob.handleCommand({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: aliceSigId, name: 'Alice', sdp: offerEvent.sdp});

      await vi.waitFor(() => expect(bob.events).toContainEqual(
        expect.objectContaining({type: 'SERVER_ANSWER_CREATED', signalingPeerId: aliceSigId})
      ));
      const answerEvent = bob.events.find(e => e.type === 'SERVER_ANSWER_CREATED' && (e as {signalingPeerId: string}).signalingPeerId === aliceSigId) as {sdp: string};

      alice.handleCommand({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: bobSigId, sdp: answerEvent.sdp});

      await vi.waitFor(() => {
        expect(alice.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTED'}));
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTED'}));
      });

      return {offerSdp: offerEvent.sdp, answerSdp: answerEvent.sdp};
    };

    it('offerer emits PEER_CONNECTION_UNSTABLE when ICE state becomes disconnected', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offerSdp} = await connectPeersViaServer(alice, bob, 'alice-sig', 'bob-sig');

      factory.simulateIceStateChange(offerSdp, 'disconnected');

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTION_UNSTABLE'}))
      );
    });

    it('answerer emits PEER_CONNECTION_UNSTABLE when ICE state becomes disconnected', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {answerSdp} = await connectPeersViaServer(alice, bob, 'alice-sig', 'bob-sig');

      factory.simulateIceStateChange(answerSdp, 'disconnected');

      await vi.waitFor(() =>
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTION_UNSTABLE'}))
      );
    });

    it('only offerer emits ICE_RESTART_OFFER_CREATED when connection becomes unstable', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offerSdp, answerSdp} = await connectPeersViaServer(alice, bob, 'alice-sig', 'bob-sig');

      factory.simulateIceStateChange(offerSdp, 'disconnected');
      factory.simulateIceStateChange(answerSdp, 'disconnected');

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual(expect.objectContaining({type: 'ICE_RESTART_OFFER_CREATED', signalingPeerId: 'bob-sig'}))
      );
      expect(bob.events).not.toContainEqual(expect.objectContaining({type: 'ICE_RESTART_OFFER_CREATED'}));
    });

    it('both peers emit PEER_CONNECTION_RESTORED when ICE recovers', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offerSdp, answerSdp} = await connectPeersViaServer(alice, bob, 'alice-sig', 'bob-sig');

      factory.simulateIceStateChange(offerSdp, 'disconnected');
      factory.simulateIceStateChange(answerSdp, 'disconnected');
      await vi.waitFor(() => expect(alice.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTION_UNSTABLE'})));

      factory.simulateIceStateChange(offerSdp, 'connected');
      factory.simulateIceStateChange(answerSdp, 'connected');

      await vi.waitFor(() => {
        expect(alice.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTION_RESTORED'}));
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTION_RESTORED'}));
      });
    });

    it('ICE_RESTART_RECEIVED command makes answerer emit ICE_RESTART_ANSWER_CREATED', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      await connectPeersViaServer(alice, bob, 'alice-sig', 'bob-sig');

      bob.handleCommand({type: 'ICE_RESTART_RECEIVED', signalingPeerId: 'alice-sig', sdp: 'fake-restart-sdp'});

      await vi.waitFor(() =>
        expect(bob.events).toContainEqual(
          expect.objectContaining({type: 'ICE_RESTART_ANSWER_CREATED', signalingPeerId: 'alice-sig'})
        )
      );
    });

    it('offerer emits PEER_DISCONNECTED after max restart attempts fail', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      const {offerSdp} = await connectPeersViaServer(alice, bob, 'alice-sig', 'bob-sig');
      const alicePeerId = (alice.events.find(e => e.type === 'PEER_CONNECTED') as {peerId: string}).peerId;

      // Trigger more disconnections than allowed retries
      for (let i = 0; i <= 3; i++) {
        factory.simulateIceStateChange(offerSdp, 'disconnected');
        await vi.waitFor(() =>
          expect(alice.events.filter(e => e.type === 'ICE_RESTART_OFFER_CREATED').length + alice.events.filter(e => e.type === 'PEER_DISCONNECTED').length).toBeGreaterThan(i)
        );
      }

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual({type: 'PEER_DISCONNECTED', peerId: alicePeerId})
      );
    });
  });

  describe('connecting via signaling server', () => {
    it('CONNECT_VIA_SERVER emits SERVER_OFFER_CREATED with signalingPeerId and SDP', async () => {
      const {createPeerConnection} = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', createPeerConnection);

      alice.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig-id', name: 'Bob'});

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual(expect.objectContaining({type: 'SERVER_OFFER_CREATED', signalingPeerId: 'bob-sig-id', sdp: expect.any(String)}))
      );
      const event = alice.events.find(e => e.type === 'SERVER_OFFER_CREATED') as {localPeerId: string};
      expect(typeof event.localPeerId).toBe('string');
    });

    it('SERVER_OFFER_RECEIVED emits SERVER_ANSWER_CREATED with signalingPeerId and SDP', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      alice.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig-id', name: 'Bob'});

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual(expect.objectContaining({type: 'SERVER_OFFER_CREATED'}))
      );
      const offerEvent = alice.events.find(e => e.type === 'SERVER_OFFER_CREATED') as {sdp: string};

      bob.handleCommand({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: 'alice-sig-id', name: 'Alice', sdp: offerEvent.sdp});

      await vi.waitFor(() =>
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'SERVER_ANSWER_CREATED', signalingPeerId: 'alice-sig-id', sdp: expect.any(String)}))
      );
    });

    it('both peers are connected after full server-brokered SDP exchange', async () => {
      const factory = createFakePeerConnectionFactory();
      const alice = makeHandler('Alice', factory.createPeerConnection);
      const bob = makeHandler('Bob', factory.createPeerConnection);

      alice.handleCommand({type: 'CONNECT_VIA_SERVER', signalingPeerId: 'bob-sig-id', name: 'Bob'});

      await vi.waitFor(() =>
        expect(alice.events).toContainEqual(expect.objectContaining({type: 'SERVER_OFFER_CREATED'}))
      );
      const offerEvent = alice.events.find(e => e.type === 'SERVER_OFFER_CREATED') as {sdp: string};

      bob.handleCommand({type: 'SERVER_OFFER_RECEIVED', signalingPeerId: 'alice-sig-id', name: 'Alice', sdp: offerEvent.sdp});

      await vi.waitFor(() =>
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'SERVER_ANSWER_CREATED'}))
      );
      const answerEvent = bob.events.find(e => e.type === 'SERVER_ANSWER_CREATED') as {sdp: string};

      alice.handleCommand({type: 'SERVER_ANSWER_RECEIVED', signalingPeerId: 'bob-sig-id', sdp: answerEvent.sdp});

      await vi.waitFor(() => {
        expect(alice.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTED'}));
        expect(bob.events).toContainEqual(expect.objectContaining({type: 'PEER_CONNECTED'}));
      });
    });
  });
});
