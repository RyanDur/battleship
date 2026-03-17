import {connectionsReducer, initialState} from './connections';
import type {ConnectionsState, HandlerState} from './connections';

const withFlow = (flow: ConnectionsState['flow']): ConnectionsState => ({...initialState, flow});
const withPeers = (peers: ConnectionsState['peers']): ConnectionsState => ({...initialState, peers});

describe('connectionsReducer', () => {
  it('CREATE_OFFER transitions to creating', () => {
    const next = connectionsReducer(initialState, {type: 'CREATE_OFFER', passphrase: 'secret'});

    expect(next.flow).toEqual({phase: 'creating', passphrase: 'secret'});
  });

  it('OFFER_SDP_READY transitions to encoding-offer carrying passphrase', () => {
    const state = withFlow({phase: 'creating', passphrase: 'secret'});

    const next = connectionsReducer(state, {type: 'OFFER_SDP_READY', peerId: 'p1', sdp: 'v=0...'});

    expect(next.flow).toEqual({phase: 'encoding-offer', peerId: 'p1', sdp: 'v=0...', passphrase: 'secret'});
  });

  it('OFFER_SDP_READY is ignored when not creating', () => {
    const next = connectionsReducer(initialState, {type: 'OFFER_SDP_READY', peerId: 'p1', sdp: 'v=0...'});

    expect(next.flow).toEqual({phase: 'idle'});
  });

  it('OFFER_ENCODED transitions to offer-ready carrying passphrase and peerId', () => {
    const state = withFlow({phase: 'encoding-offer', peerId: 'p1', sdp: 'v=0...', passphrase: 'secret'});

    const next = connectionsReducer(state, {type: 'OFFER_ENCODED', peerId: 'p1', code: 'abc123'});

    expect(next.flow).toEqual({phase: 'offer-ready', peerId: 'p1', code: 'abc123', passphrase: 'secret'});
  });

  it('OFFER_ENCODED is ignored when not encoding-offer', () => {
    const next = connectionsReducer(initialState, {type: 'OFFER_ENCODED', peerId: 'p1', code: 'abc123'});

    expect(next.flow).toEqual({phase: 'idle'});
  });

  it('JOIN_OFFER transitions to joining', () => {
    const next = connectionsReducer(initialState, {type: 'JOIN_OFFER', code: 'abc', passphrase: 'secret'});

    expect(next.flow).toEqual({phase: 'joining', passphrase: 'secret'});
  });

  it('ANSWER_SDP_READY transitions to encoding-answer carrying passphrase', () => {
    const state = withFlow({phase: 'joining', passphrase: 'secret'});

    const next = connectionsReducer(state, {type: 'ANSWER_SDP_READY', sdp: 'v=0...'});

    expect(next.flow).toEqual({phase: 'encoding-answer', sdp: 'v=0...', passphrase: 'secret'});
  });

  it('ANSWER_SDP_READY is ignored when not joining', () => {
    const next = connectionsReducer(initialState, {type: 'ANSWER_SDP_READY', sdp: 'v=0...'});

    expect(next.flow).toEqual({phase: 'idle'});
  });

  it('ANSWER_ENCODED transitions to answer-ready', () => {
    const state = withFlow({phase: 'encoding-answer', sdp: 'v=0...', passphrase: 'secret'});

    const next = connectionsReducer(state, {type: 'ANSWER_ENCODED', code: 'xyz789'});

    expect(next.flow).toEqual({phase: 'answer-ready', code: 'xyz789'});
  });

  it('DECODE_FAILED resets flow to idle', () => {
    const state = withFlow({phase: 'joining', passphrase: 'wrong'});

    const next = connectionsReducer(state, {type: 'DECODE_FAILED'});

    expect(next.flow).toEqual({phase: 'idle'});
  });

  it('PEER_CONNECTED adds peer to list', () => {
    const next = connectionsReducer(initialState, {type: 'PEER_CONNECTED', peerId: 'p1'});

    expect(next.peers).toEqual([{id: 'p1'}]);
  });

  it('PEER_DISCONNECTED removes peer from list', () => {
    const state = withPeers([{id: 'p1'}, {id: 'p2'}]);

    const next = connectionsReducer(state, {type: 'PEER_DISCONNECTED', peerId: 'p1'});

    expect(next.peers).toEqual([{id: 'p2'}]);
  });

  it('PEER_NAMED updates matching peer name', () => {
    const state = withPeers([{id: 'p1'}, {id: 'p2'}]);

    const next = connectionsReducer(state, {type: 'PEER_NAMED', peerId: 'p1', name: 'Alice'});

    expect(next.peers).toEqual([{id: 'p1', name: 'Alice'}, {id: 'p2'}]);
  });

  it('GRANT_TRUST sets trusted on matching peer', () => {
    const state = withPeers([{id: 'p1'}, {id: 'p2'}]);

    const next = connectionsReducer(state, {type: 'GRANT_TRUST', peerId: 'p1'});

    expect(next.peers).toEqual([{id: 'p1', trusted: true}, {id: 'p2'}]);
  });

  it('REVOKE_TRUST clears trusted on matching peer', () => {
    const state = withPeers([{id: 'p1', trusted: true}, {id: 'p2'}]);

    const next = connectionsReducer(state, {type: 'REVOKE_TRUST', peerId: 'p1'});

    expect(next.peers).toEqual([{id: 'p1', trusted: false}, {id: 'p2'}]);
  });

  it('PEER_TRUST_UPDATED with trusts: true sets trustsMe on matching peer', () => {
    const state = withPeers([{id: 'p1'}, {id: 'p2'}]);

    const next = connectionsReducer(state, {type: 'PEER_TRUST_UPDATED', peerId: 'p1', trusts: true});

    expect(next.peers).toEqual([{id: 'p1', trustsMe: true}, {id: 'p2'}]);
  });

  it('PEER_TRUST_UPDATED with trusts: false clears trustsMe on matching peer', () => {
    const state = withPeers([{id: 'p1', trustsMe: true}, {id: 'p2'}]);

    const next = connectionsReducer(state, {type: 'PEER_TRUST_UPDATED', peerId: 'p1', trusts: false});

    expect(next.peers).toEqual([{id: 'p1', trustsMe: false}, {id: 'p2'}]);
  });

  it('INTRODUCTION_RECEIVED adds to pendingIntroductions', () => {
    const next = connectionsReducer(initialState, {type: 'INTRODUCTION_RECEIVED', introId: 'i1', from: 'Alice', peer: 'Carol'});

    expect(next.pendingIntroductions).toEqual([{introId: 'i1', from: 'Alice', peer: 'Carol'}]);
  });

  it('INTRODUCTION_RESOLVED removes matching pendingIntroduction', () => {
    const state = {...initialState, pendingIntroductions: [{introId: 'i1', from: 'Alice', peer: 'Carol'}]};

    const next = connectionsReducer(state, {type: 'INTRODUCTION_RESOLVED', introId: 'i1'});

    expect(next.pendingIntroductions).toEqual([]);
  });

  it('ACCEPT_INTRODUCTION removes matching pendingIntroduction', () => {
    const state = {...initialState, pendingIntroductions: [{introId: 'i1', from: 'Alice', peer: 'Carol'}]};

    const next = connectionsReducer(state, {type: 'ACCEPT_INTRODUCTION', introId: 'i1'});

    expect(next.pendingIntroductions).toEqual([]);
  });

  it('DECLINE_INTRODUCTION removes matching pendingIntroduction', () => {
    const state = {...initialState, pendingIntroductions: [{introId: 'i1', from: 'Alice', peer: 'Carol'}]};

    const next = connectionsReducer(state, {type: 'DECLINE_INTRODUCTION', introId: 'i1'});

    expect(next.pendingIntroductions).toEqual([]);
  });

  it('does not mutate existing state', () => {
    const state = withPeers([{id: 'p1'}]);
    const frozen = Object.freeze(state);

    expect(() => connectionsReducer(frozen, {type: 'PEER_CONNECTED', peerId: 'p2'})).not.toThrow();
  });

  it('ONLINE_PEERS_UPDATED replaces onlinePeers list', () => {
    const peers = [{peerId: 'p1', name: 'Alice'}, {peerId: 'p2', name: 'Bob'}];

    const next = connectionsReducer(initialState, {type: 'ONLINE_PEERS_UPDATED', peers});

    expect(next.onlinePeers).toEqual(peers);
  });

  it('ONLINE_PEER_JOINED adds peer to onlinePeers', () => {
    const next = connectionsReducer(initialState, {type: 'ONLINE_PEER_JOINED', peerId: 'p1', name: 'Alice'});

    expect(next.onlinePeers).toEqual([{peerId: 'p1', name: 'Alice'}]);
  });

  it('ONLINE_PEER_LEFT removes peer from onlinePeers', () => {
    const state = {...initialState, onlinePeers: [{peerId: 'p1', name: 'Alice'}, {peerId: 'p2', name: 'Bob'}]};

    const next = connectionsReducer(state, {type: 'ONLINE_PEER_LEFT', peerId: 'p1'});

    expect(next.onlinePeers).toEqual([{peerId: 'p2', name: 'Bob'}]);
  });

  it('ONLINE_PEER_JOINED marks matching previous peer as online', () => {
    const state = {...initialState, previousPeers: [{peerId: 'p1', name: 'Alice', online: false}]};

    const next = connectionsReducer(state, {type: 'ONLINE_PEER_JOINED', peerId: 'p1', name: 'Alice'});

    expect(next.previousPeers).toEqual([{peerId: 'p1', name: 'Alice', online: true}]);
  });

  it('ONLINE_PEER_JOINED leaves previousPeers unchanged when peer is not in previousPeers', () => {
    const state = {...initialState, previousPeers: [{peerId: 'p2', name: 'Bob', online: false}]};

    const next = connectionsReducer(state, {type: 'ONLINE_PEER_JOINED', peerId: 'p1', name: 'Alice'});

    expect(next.previousPeers).toEqual([{peerId: 'p2', name: 'Bob', online: false}]);
  });

  it('PREVIOUS_PEERS_RECEIVED replaces previousPeers list', () => {
    const peers = [{peerId: 'p1', name: 'Alice', online: false}];

    const next = connectionsReducer(initialState, {type: 'PREVIOUS_PEERS_RECEIVED', peers});

    expect(next.previousPeers).toEqual(peers);
  });

  it('ONLINE_PEER_LEFT marks matching previous peer as offline', () => {
    const state = {...initialState, previousPeers: [{peerId: 'p1', name: 'Alice', online: true}]};

    const next = connectionsReducer(state, {type: 'ONLINE_PEER_LEFT', peerId: 'p1'});

    expect(next.previousPeers).toEqual([{peerId: 'p1', name: 'Alice', online: false}]);
  });

  it('ONLINE_PEER_LEFT leaves previousPeers unchanged when peer is not in previousPeers', () => {
    const state = {...initialState, previousPeers: [{peerId: 'p2', name: 'Bob', online: true}]};

    const next = connectionsReducer(state, {type: 'ONLINE_PEER_LEFT', peerId: 'p1'});

    expect(next.previousPeers).toEqual([{peerId: 'p2', name: 'Bob', online: true}]);
  });

  it('PREVIOUS_PEER_CONNECTED removes peer from previousPeers', () => {
    const state = {...initialState, previousPeers: [{peerId: 'p1', name: 'Alice', online: true}]};

    const next = connectionsReducer(state, {type: 'PREVIOUS_PEER_CONNECTED', signalingPeerId: 'p1'});

    expect(next.previousPeers).toEqual([]);
  });

  it('PREVIOUS_PEER_CONNECTED leaves previousPeers unchanged when peer not found', () => {
    const state = {...initialState, previousPeers: [{peerId: 'p1', name: 'Alice', online: true}]};

    const next = connectionsReducer(state, {type: 'PREVIOUS_PEER_CONNECTED', signalingPeerId: 'unknown'});

    expect(next.previousPeers).toEqual([{peerId: 'p1', name: 'Alice', online: true}]);
  });

  it('PEER_CONNECTION_UNSTABLE marks peer as unstable in peerConnectionHealth', () => {
    const next = connectionsReducer(initialState, {type: 'PEER_CONNECTION_UNSTABLE', peerId: 'p1'});

    expect(next.peerConnectionHealth).toEqual({'p1': 'unstable'});
  });

  it('PEER_CONNECTION_RESTORED marks peer as stable in peerConnectionHealth', () => {
    const state = {...initialState, peerConnectionHealth: {'p1': 'unstable' as const}};

    const next = connectionsReducer(state, {type: 'PEER_CONNECTION_RESTORED', peerId: 'p1'});

    expect(next.peerConnectionHealth).toEqual({'p1': 'stable'});
  });

  it('PEER_DISCONNECTED removes peer from peerConnectionHealth', () => {
    const state = {...initialState, peerConnectionHealth: {'p1': 'unstable' as const}};

    const next = connectionsReducer(state, {type: 'PEER_DISCONNECTED', peerId: 'p1'});

    expect(next.peerConnectionHealth).toEqual({});
  });

  it('FORGET_PEER removes peer from previousPeers', () => {
    const state = {...initialState, previousPeers: [{peerId: 'p1', name: 'Alice', online: false}]};

    const next = connectionsReducer(state, {type: 'FORGET_PEER', peerId: 'p1'});

    expect(next.previousPeers).toEqual([]);
  });

  it('FORGET_PEER leaves previousPeers unchanged when peer not found', () => {
    const state = {...initialState, previousPeers: [{peerId: 'p1', name: 'Alice', online: false}]};

    const next = connectionsReducer(state, {type: 'FORGET_PEER', peerId: 'unknown'});

    expect(next.previousPeers).toEqual([{peerId: 'p1', name: 'Alice', online: false}]);
  });

  describe('handlerState', () => {
    const withHandlerState = (hs: Partial<HandlerState>): ConnectionsState => ({
      ...initialState,
      handlerState: {...initialState.handlerState, ...hs},
    });

    it('initial state has empty handler maps', () => {
      expect(initialState.handlerState).toEqual({
        signalingToPeer: {},
        peerToSignaling: {},
        offererPeerIds: [],
        iceRestartAttempts: {},
        introChannels: {},
      });
    });

    it('SIGNALING_PEER_REGISTERED records bidirectional mapping', () => {
      const next = connectionsReducer(initialState, {type: 'SIGNALING_PEER_REGISTERED', localPeerId: 'p1', signalingPeerId: 'sig1', isOfferer: false});

      expect(next.handlerState.signalingToPeer).toEqual({'sig1': 'p1'});
      expect(next.handlerState.peerToSignaling).toEqual({'p1': 'sig1'});
    });

    it('SIGNALING_PEER_REGISTERED with isOfferer adds to offererPeerIds', () => {
      const next = connectionsReducer(initialState, {type: 'SIGNALING_PEER_REGISTERED', localPeerId: 'p1', signalingPeerId: 'sig1', isOfferer: true});

      expect(next.handlerState.offererPeerIds).toContain('p1');
    });

    it('SIGNALING_PEER_REGISTERED without isOfferer does not add to offererPeerIds', () => {
      const next = connectionsReducer(initialState, {type: 'SIGNALING_PEER_REGISTERED', localPeerId: 'p1', signalingPeerId: 'sig1', isOfferer: false});

      expect(next.handlerState.offererPeerIds).not.toContain('p1');
    });

    it('ICE_RESTART_ATTEMPTED sets attempt count to 1 initially', () => {
      const next = connectionsReducer(initialState, {type: 'ICE_RESTART_ATTEMPTED', peerId: 'p1'});

      expect(next.handlerState.iceRestartAttempts).toEqual({'p1': 1});
    });

    it('ICE_RESTART_ATTEMPTED increments existing count', () => {
      const state = withHandlerState({iceRestartAttempts: {'p1': 2}});

      const next = connectionsReducer(state, {type: 'ICE_RESTART_ATTEMPTED', peerId: 'p1'});

      expect(next.handlerState.iceRestartAttempts).toEqual({'p1': 3});
    });

    it('PEER_CONNECTION_RESTORED removes peer from iceRestartAttempts', () => {
      const state = withHandlerState({iceRestartAttempts: {'p1': 2}});

      const next = connectionsReducer(state, {type: 'PEER_CONNECTION_RESTORED', peerId: 'p1'});

      expect(next.handlerState.iceRestartAttempts).toEqual({});
    });

    it('PEER_DISCONNECTED removes peer from all handler maps', () => {
      const state = withHandlerState({
        signalingToPeer: {'sig1': 'p1'},
        peerToSignaling: {'p1': 'sig1'},
        offererPeerIds: ['p1'],
        iceRestartAttempts: {'p1': 1},
      });

      const next = connectionsReducer(state, {type: 'PEER_DISCONNECTED', peerId: 'p1'});

      expect(next.handlerState.signalingToPeer).toEqual({});
      expect(next.handlerState.peerToSignaling).toEqual({});
      expect(next.handlerState.offererPeerIds).not.toContain('p1');
      expect(next.handlerState.iceRestartAttempts).toEqual({});
    });

    it('PEER_DISCONNECTED leaves other peers in handler maps untouched', () => {
      const state = withHandlerState({
        signalingToPeer: {'sig1': 'p1', 'sig2': 'p2'},
        peerToSignaling: {'p1': 'sig1', 'p2': 'sig2'},
        offererPeerIds: ['p1', 'p2'],
        iceRestartAttempts: {'p1': 1, 'p2': 2},
      });

      const next = connectionsReducer(state, {type: 'PEER_DISCONNECTED', peerId: 'p1'});

      expect(next.handlerState.signalingToPeer).toEqual({'sig2': 'p2'});
      expect(next.handlerState.peerToSignaling).toEqual({'p2': 'sig2'});
      expect(next.handlerState.offererPeerIds).toEqual(['p2']);
      expect(next.handlerState.iceRestartAttempts).toEqual({'p2': 2});
    });
  });
});
