import {describe, it, expect, vi} from 'vitest';
import {createCoinFlipProtocol} from './coinFlipProtocol';
import type {GameAction} from './game';

const makeDeps = () => {
  const sent: {peerId: string; message: Record<string, unknown>}[] = [];
  const dispatched: GameAction[] = [];
  return {
    deps: {
      sendToPeer: (peerId: string, message: unknown) => { sent.push({peerId, message: message as Record<string, unknown>}); },
      getOffererPeerIds: () => [] as string[],
      dispatch: (action: GameAction) => { dispatched.push(action); },
    },
    sent,
    dispatched,
  };
};

describe('coinFlipProtocol', () => {
  describe('normal flow', () => {
    it('initiator commits, responder reveals, initiator reveals, both resolve turn order', async () => {
      const {deps: aliceDeps, sent: aliceSent, dispatched: aliceDispatched} = makeDeps();
      const {deps: bobDeps, sent: bobSent, dispatched: bobDispatched} = makeDeps();

      const alice = createCoinFlipProtocol(aliceDeps);
      const bob = createCoinFlipProtocol(bobDeps);

      // Alice starts the coin flip (initiator)
      alice.start('bob');

      // Wait for alice's hash to complete and send COMMIT
      await vi.waitFor(() => expect(aliceSent).toHaveLength(1));
      expect(aliceSent[0].message.type).toBe('COIN_FLIP_COMMIT');
      const commitHash = aliceSent[0].message.hash as string;
      expect(typeof commitHash).toBe('string');

      // Bob receives Alice's COMMIT, sends REVEAL immediately
      bob.handleMessage('alice', aliceSent[0].message);

      expect(bobSent).toHaveLength(1);
      expect(bobSent[0].message.type).toBe('COIN_FLIP_REVEAL');

      // Alice receives Bob's REVEAL, sends her own REVEAL
      alice.handleMessage('bob', bobSent[0].message);

      // Wait for Alice's hash verification and Bob's receive of Alice's reveal
      await vi.waitFor(() => expect(aliceSent).toHaveLength(2));
      expect(aliceSent[1].message.type).toBe('COIN_FLIP_REVEAL');

      // Bob receives Alice's REVEAL
      bob.handleMessage('alice', aliceSent[1].message);

      // Both should have dispatched TURN_ORDER_DECIDED
      await vi.waitFor(() => expect(aliceDispatched).toHaveLength(1));
      await vi.waitFor(() => expect(bobDispatched).toHaveLength(1));

      const aliceResult = aliceDispatched[0];
      const bobResult = bobDispatched[0];
      if (aliceResult.type !== 'TURN_ORDER_DECIDED') throw new Error('expected TURN_ORDER_DECIDED');
      if (bobResult.type !== 'TURN_ORDER_DECIDED') throw new Error('expected TURN_ORDER_DECIDED');

      // Neither is offerer (getOffererPeerIds returns []), so both evaluate same XOR with same rule
      // Both agree on who goes first (same iGoFirst value from same merged XOR)
      expect(aliceResult.iGoFirst).toBe(bobResult.iGoFirst);
    });
  });

  describe('simultaneous flip', () => {
    it('both commit at same time — offerer yields initiator role, both resolve to opposite turns', async () => {
      // Alice is the offerer (alice is in bob's offererPeerIds)
      const {deps: aliceDeps, sent: aliceSent, dispatched: aliceDispatched} = makeDeps();
      aliceDeps.getOffererPeerIds = () => ['bob']; // alice is offerer relative to bob

      const {deps: bobDeps, sent: bobSent, dispatched: bobDispatched} = makeDeps();
      bobDeps.getOffererPeerIds = () => [] as string[]; // bob is answerer relative to alice

      const alice = createCoinFlipProtocol(aliceDeps);
      const bob = createCoinFlipProtocol(bobDeps);

      // Both start simultaneously
      alice.start('bob');
      bob.start('alice');

      // Wait for both hashes
      await vi.waitFor(() => expect(aliceSent[0]?.message.type).toBe('COIN_FLIP_COMMIT'));
      await vi.waitFor(() => expect(bobSent[0]?.message.type).toBe('COIN_FLIP_COMMIT'));

      // Each receives the other's COMMIT (simultaneous)
      alice.handleMessage('bob', bobSent[0].message);
      bob.handleMessage('alice', aliceSent[0].message);

      // Offerer (alice) yields — both send REVEAL
      await vi.waitFor(() => expect(aliceSent.find(s => s.message.type === 'COIN_FLIP_REVEAL')).toBeDefined());
      await vi.waitFor(() => expect(bobSent.find(s => s.message.type === 'COIN_FLIP_REVEAL')).toBeDefined());

      const aliceReveal = aliceSent.find(s => s.message.type === 'COIN_FLIP_REVEAL');
      const bobReveal = bobSent.find(s => s.message.type === 'COIN_FLIP_REVEAL');

      // Each receives the other's REVEAL
      if (aliceReveal) bob.handleMessage('alice', aliceReveal.message);
      if (bobReveal) alice.handleMessage('bob', bobReveal.message);

      await vi.waitFor(() => expect(aliceDispatched).toHaveLength(1));
      await vi.waitFor(() => expect(bobDispatched).toHaveLength(1));

      const aliceResult = aliceDispatched[0];
      const bobResult = bobDispatched[0];
      if (aliceResult.type !== 'TURN_ORDER_DECIDED') throw new Error('expected TURN_ORDER_DECIDED');
      if (bobResult.type !== 'TURN_ORDER_DECIDED') throw new Error('expected TURN_ORDER_DECIDED');

      // Opposite turns
      expect(aliceResult.iGoFirst).not.toBe(bobResult.iGoFirst);
    });
  });

  describe('message filtering', () => {
    it('ignores non-coin-flip messages without dispatching or sending', () => {
      const {deps, sent, dispatched} = makeDeps();
      const protocol = createCoinFlipProtocol(deps);

      protocol.handleMessage('peer1', {type: 'CHALLENGE', opponentId: 'x'});
      protocol.handleMessage('peer1', {type: 'BOARD_HASH', hash: 'abc'});
      protocol.handleMessage('peer1', 'not an object');
      protocol.handleMessage('peer1', null);

      expect(sent).toHaveLength(0);
      expect(dispatched).toHaveLength(0);
    });
  });

  describe('hash mismatch', () => {
    it('cheater who reveals wrong value dispatches COIN_FLIP_FAILED', async () => {
      const {deps, sent, dispatched} = makeDeps();
      const protocol = createCoinFlipProtocol(deps);

      // Protocol receives a COMMIT with a bogus hash
      protocol.handleMessage('cheater', {type: 'COIN_FLIP_COMMIT', hash: 'bogus-hash-that-wont-match'});

      // We (responder) sent REVEAL
      expect(sent).toHaveLength(1);
      expect(sent[0].message.type).toBe('COIN_FLIP_REVEAL');

      // Cheater "reveals" a value that does NOT match their hash
      protocol.handleMessage('cheater', {type: 'COIN_FLIP_REVEAL', value: 12345});

      await vi.waitFor(() => expect(dispatched).toHaveLength(1));
      expect(dispatched[0].type).toBe('COIN_FLIP_FAILED');
    });
  });
});
