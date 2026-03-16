import {useState} from 'react';
import {useConnectionState, useConnectionStore} from '../state/useConnection';
import type {ConnectionFlow, Peer, PreviousPeer} from '../state/connections';

type FlowPhase =
  | {phase: 'idle'}
  | {phase: 'creating'}
  | {phase: 'offer-ready'; code: string}
  | {phase: 'joining'}
  | {phase: 'answer-ready'; code: string}

const toFlowPhase = (flow: ConnectionFlow): FlowPhase => {
  if (flow.phase === 'offer-ready') return {phase: 'offer-ready', code: flow.code};
  if (flow.phase === 'answer-ready') return {phase: 'answer-ready', code: flow.code};
  if (flow.phase === 'encoding-offer') return {phase: 'creating'};
  if (flow.phase === 'encoding-answer') return {phase: 'joining'};
  return {phase: flow.phase};
};

type Props = {
  serviceOnline: boolean
}

const PeerRow = ({peer, otherTrustingPeers}: {peer: Peer; otherTrustingPeers: Peer[]}) => {
  const store = useConnectionStore();
  const [introducing, setIntroducing] = useState(false);
  const showIntroduceButton = peer.trustsMe && otherTrustingPeers.length > 0;

  return (
    <li>
      {peer.name ?? 'Unknown'}
      {peer.trustsMe && <span>Trusts you to introduce them</span>}
      {showIntroduceButton && !introducing && (
        <button onClick={() => setIntroducing(true)}>Introduce</button>
      )}
      {introducing && otherTrustingPeers.map(other => (
        <button
          key={other.id}
          onClick={() => { store.dispatch({type: 'INTRODUCE_PEERS', peerId1: peer.id, peerId2: other.id}); setIntroducing(false); }}
        >
          {other.name ?? 'Unknown'}
        </button>
      ))}
      {peer.trusted
        ? <button onClick={() => store.dispatch({type: 'REVOKE_TRUST', peerId: peer.id})}>Revoke trust</button>
        : <button onClick={() => store.dispatch({type: 'GRANT_TRUST', peerId: peer.id})}>Trust</button>
      }
      <button onClick={() => store.dispatch({type: 'DISCONNECT', peerId: peer.id})}>Disconnect</button>
    </li>
  );
};

const PreviousPeerRow = ({peer}: {peer: PreviousPeer}) => {
  const store = useConnectionStore();
  return (
    <li>
      {peer.name}
      <span>{peer.online ? 'Online' : 'Offline'}</span>
      {peer.online && (
        <button onClick={() => store.dispatch({type: 'RECONNECT_VIA_SERVER', signalingPeerId: peer.peerId, name: peer.name})}>Reconnect</button>
      )}
    </li>
  );
};

export const Connections = ({serviceOnline}: Props) => {
  const store = useConnectionStore();
  const flow = toFlowPhase(useConnectionState(s => s.flow));
  const peers = useConnectionState(s => s.peers);
  const pendingIntroductions = useConnectionState(s => s.pendingIntroductions);
  const onlinePeers = useConnectionState(s => s.onlinePeers);
  const previousPeers = useConnectionState(s => s.previousPeers);

  const [formMode, setFormMode] = useState<'none' | 'create' | 'join'>('none');
  const [passphrase, setPassphrase] = useState('');
  const [offerCode, setOfferCode] = useState('');
  const [responseCode, setResponseCode] = useState('');

  if (!serviceOnline) return null;

  const trustingPeers = peers.filter(p => p.trustsMe);

  const renderFlow = () => {
    if (flow.phase === 'offer-ready') {
      return (
        <div>
          <p>Share this code with the other person:</p>
          <code>{flow.code}</code>
          <div>
            <label htmlFor="response-code">Response code</label>
            <input
              id="response-code"
              value={responseCode}
              onChange={e => setResponseCode(e.target.value)}
            />
            <button onClick={() => store.dispatch({type: 'ACCEPT_ANSWER_CODE', responseCode})}>Connect</button>
          </div>
        </div>
      );
    }

    if (flow.phase === 'answer-ready') {
      return (
        <div>
          <p>Share this response code with the other person:</p>
          <code>{flow.code}</code>
        </div>
      );
    }

    if (flow.phase === 'creating' || flow.phase === 'joining') {
      return <p>Generating...</p>;
    }

    if (formMode === 'create') {
      return (
        <form onSubmit={e => { e.preventDefault(); store.dispatch({type: 'CREATE_OFFER', passphrase}); }}>
          <label htmlFor="create-passphrase">Passphrase</label>
          <input
            id="create-passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
          />
          <button type="submit">Generate code</button>
        </form>
      );
    }

    if (formMode === 'join') {
      return (
        <form onSubmit={e => { e.preventDefault(); store.dispatch({type: 'JOIN_OFFER', code: offerCode, passphrase}); }}>
          <label htmlFor="join-passphrase">Passphrase</label>
          <input
            id="join-passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
          />
          <label htmlFor="offer-code">Offer code</label>
          <input
            id="offer-code"
            value={offerCode}
            onChange={e => setOfferCode(e.target.value)}
          />
          <button type="submit">Join</button>
        </form>
      );
    }

    return (
      <div>
        <button onClick={() => setFormMode('create')}>Create</button>
        <button onClick={() => setFormMode('join')}>Join</button>
      </div>
    );
  };

  return (
    <section>
      {previousPeers.length > 0 && (
        <ul aria-label="Previous peers">
          {previousPeers.map(peer => (
            <PreviousPeerRow key={peer.peerId} peer={peer} />
          ))}
        </ul>
      )}
      {onlinePeers.length > 0 && (
        <ul aria-label="Online peers">
          {onlinePeers.map(peer => (
            <li key={peer.peerId}>
              {peer.name}
              <button onClick={() => store.dispatch({type: 'CONNECT_VIA_SERVER', signalingPeerId: peer.peerId, name: peer.name})}>Connect</button>
            </li>
          ))}
        </ul>
      )}
      {renderFlow()}
      {peers.length > 0 && (
        <ul>
          {peers.map(peer => (
            <PeerRow
              key={peer.id}
              peer={peer}
              otherTrustingPeers={trustingPeers.filter(p => p.id !== peer.id)}
            />
          ))}
        </ul>
      )}
      {pendingIntroductions.length > 0 && (
        <ul>
          {pendingIntroductions.map(intro => (
            <li key={intro.introId}>
              {intro.from} wants to introduce you to {intro.peer}
              <button onClick={() => store.dispatch({type: 'ACCEPT_INTRODUCTION', introId: intro.introId})}>Accept</button>
              <button onClick={() => store.dispatch({type: 'DECLINE_INTRODUCTION', introId: intro.introId})}>Decline</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
