import {connectionsReducer, initialState} from './connections';
import type {ConnectionsState} from './connections';

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
    const next = connectionsReducer(initialState, {type: 'JOIN_OFFER', passphrase: 'secret'});

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

  it('TRUST_PEER sets trusted on matching peer', () => {
    const state = withPeers([{id: 'p1'}, {id: 'p2'}]);

    const next = connectionsReducer(state, {type: 'TRUST_PEER', peerId: 'p1'});

    expect(next.peers).toEqual([{id: 'p1', trusted: true}, {id: 'p2'}]);
  });

  it('REVOKE_PEER_TRUST clears trusted on matching peer', () => {
    const state = withPeers([{id: 'p1', trusted: true}, {id: 'p2'}]);

    const next = connectionsReducer(state, {type: 'REVOKE_PEER_TRUST', peerId: 'p1'});

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

  it('does not mutate existing state', () => {
    const state = withPeers([{id: 'p1'}]);
    const frozen = Object.freeze(state);

    expect(() => connectionsReducer(frozen, {type: 'PEER_CONNECTED', peerId: 'p2'})).not.toThrow();
  });
});
