import {useState} from 'react';
import {useConnectionState, useConnectionStore} from '../state/useConnection';
import type {ConnectionFlow, Peer, PreviousPeer} from '../state/connections';
import {selectFlow, selectPeers, selectPendingIntroductions, selectOnlinePeers, selectPreviousPeers, selectPeerConnectionHealth} from '../state/connectionSelectors';
import {introducePeers, revokeTrust, grantTrust, disconnect, savePeerEmail, reconnectViaServer, forgetPeer, acceptAnswerCode, cancelOffer, createOffer, joinOffer, connectViaServer, acceptIntroduction, declineIntroduction} from '../state/connectionActions';

type FlowPhase =
  | {phase: 'idle'}
  | {phase: 'creating'}
  | {phase: 'offer-ready'; code: string}
  | {phase: 'offer-failed'}
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

const PeerRow = ({peer, otherTrustingPeers, unstable}: {peer: Peer; otherTrustingPeers: Peer[]; unstable: boolean}) => {
  const store = useConnectionStore();
  const [introducing, setIntroducing] = useState(false);
  const showIntroduceButton = peer.trustsMe && otherTrustingPeers.length > 0;

  return (
    <li>
      {peer.name ?? 'Unknown'}
      {unstable && <span>Reconnecting...</span>}
      {peer.trustsMe && <span>Trusts you to introduce them</span>}
      {showIntroduceButton && !introducing && (
        <button onClick={() => setIntroducing(true)}>Introduce</button>
      )}
      {introducing && otherTrustingPeers.map(other => (
        <button
          key={other.id}
          onClick={() => { store.dispatch(introducePeers(peer.id, other.id)); setIntroducing(false); }}
        >
          {other.name ?? 'Unknown'}
        </button>
      ))}
      {peer.trusted
        ? <button onClick={() => store.dispatch(revokeTrust(peer.id))}>Revoke trust</button>
        : <button onClick={() => store.dispatch(grantTrust(peer.id))}>Trust</button>
      }
      <button onClick={() => store.dispatch(disconnect(peer.id))}>Disconnect</button>
    </li>
  );
};

const PreviousPeerRow = ({peer}: {peer: PreviousPeer}) => {
  const store = useConnectionStore();
  const [emailInput, setEmailInput] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInput.trim()) {
      store.dispatch(savePeerEmail(peer.peerId, emailInput.trim()));
      setEmailInput('');
    }
  };

  return (
    <li>
      {peer.name}
      <span>{peer.online ? 'Online' : 'Offline'}</span>
      {peer.online && (
        <button onClick={() => store.dispatch(reconnectViaServer(peer.peerId, peer.name))}>Reconnect</button>
      )}
      {!peer.online && peer.email && (
        <a href={`mailto:${peer.email}`}>Invite</a>
      )}
      {!peer.online && !peer.email && (
        <form onSubmit={handleEmailSubmit}>
          <input
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            placeholder="Enter email"
          />
        </form>
      )}
      <button onClick={() => store.dispatch(forgetPeer(peer.peerId))}>Forget</button>
    </li>
  );
};

export const Connections = ({serviceOnline}: Props) => {
  const store = useConnectionStore();
  const flow = toFlowPhase(useConnectionState(selectFlow));
  const peers = useConnectionState(selectPeers);
  const peerConnectionHealth = useConnectionState(selectPeerConnectionHealth);
  const pendingIntroductions = useConnectionState(selectPendingIntroductions);
  const onlinePeers = useConnectionState(selectOnlinePeers);
  const previousPeers = useConnectionState(selectPreviousPeers);

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
            <button onClick={() => store.dispatch(acceptAnswerCode(responseCode))}>Accept</button>
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

    if (flow.phase === 'offer-failed') {
      return (
        <div>
          <p>Failed to generate a code. Please try again.</p>
          <button onClick={() => store.dispatch(cancelOffer())}>Cancel</button>
        </div>
      );
    }

    if (flow.phase === 'creating' || flow.phase === 'joining') {
      return <p>Generating...</p>;
    }

    if (formMode === 'create') {
      return (
        <form onSubmit={e => { e.preventDefault(); store.dispatch(createOffer(passphrase)); }}>
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
        <form onSubmit={e => { e.preventDefault(); store.dispatch(joinOffer(offerCode, passphrase)); }}>
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
              <button onClick={() => store.dispatch(connectViaServer(peer.peerId, peer.name))}>Connect</button>
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
              unstable={peerConnectionHealth[peer.id] === 'unstable'}
            />
          ))}
        </ul>
      )}
      {pendingIntroductions.length > 0 && (
        <ul>
          {pendingIntroductions.map(intro => (
            <li key={intro.introId}>
              {intro.from} wants to introduce you to {intro.peer}
              <button onClick={() => store.dispatch(acceptIntroduction(intro.introId))}>Accept</button>
              <button onClick={() => store.dispatch(declineIntroduction(intro.introId))}>Decline</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
