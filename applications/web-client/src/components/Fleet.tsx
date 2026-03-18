import {useState} from 'react';
import {useConnectionState, useConnectionStore} from '../state/useConnection';
import type {Peer, PreviousPeer} from '../state/connections';
import {selectPeers, selectPendingIntroductions, selectOnlinePeers, selectPreviousPeers, selectPeerConnectionHealth, selectMessages} from '../state/connectionSelectors';
import {introducePeers, revokeTrust, grantTrust, disconnect, savePeerEmail, reconnectViaServer, forgetPeer, connectViaServer, acceptIntroduction, declineIntroduction, sendMessage} from '../state/connectionActions';

const PeerCard = ({peer, otherTrustingPeers, unstable}: {peer: Peer; otherTrustingPeers: Peer[]; unstable: boolean}) => {
  const store = useConnectionStore();
  const [introducing, setIntroducing] = useState(false);
  const [messageText, setMessageText] = useState('');
  const allMessages = useConnectionState(selectMessages);
  const messages = allMessages.filter(m => m.peerId === peer.id);
  const showIntroduceButton = peer.trustsMe && otherTrustingPeers.length > 0;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim()) {
      store.dispatch(sendMessage(peer.id, messageText.trim()));
      setMessageText('');
    }
  };

  return (
    <article className="fleet-peer-card">
      <strong className="fleet-peer-name">{peer.name ?? 'Unknown'}</strong>
      {unstable && <small className="fleet-peer-health">Reconnecting...</small>}
      {peer.trustsMe && (
        <abbr className="fleet-peer-trust" aria-label="Trusts you to introduce them">★</abbr>
      )}
      {showIntroduceButton && !introducing && (
        <button className="control" onClick={() => setIntroducing(true)}>Introduce</button>
      )}
      {introducing && otherTrustingPeers.map(other => (
        <button
          className="control"
          key={other.id}
          onClick={() => { store.dispatch(introducePeers(peer.id, other.id)); setIntroducing(false); }}
        >
          {other.name ?? 'Unknown'}
        </button>
      ))}
      {peer.trusted
        ? <button className="control" onClick={() => store.dispatch(revokeTrust(peer.id))}>Revoke trust</button>
        : <button className="control" onClick={() => store.dispatch(grantTrust(peer.id))}>Trust</button>
      }
      <button className="control" onClick={() => store.dispatch(disconnect(peer.id))}>Disconnect</button>
      {messages.length > 0 && (
        <ul aria-label="Messages">
          {messages.map((m, i) => (
            <li key={i}>{m.fromSelf ? 'You' : (peer.name ?? 'Unknown')}: {m.text}</li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSend}>
        <label htmlFor={`message-${peer.id}`}>Message</label>
        <input
          className="field"
          id={`message-${peer.id}`}
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
        />
        <button className="control" type="submit">Send</button>
      </form>
    </article>
  );
};

const PreviousPeerCard = ({peer}: {peer: PreviousPeer}) => {
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
    <article className="fleet-peer-card">
      <strong className="fleet-peer-name">{peer.name}</strong>
      <small className="fleet-peer-status">{peer.online ? 'Online' : 'Offline'}</small>
      {peer.online && (
        <button className="control" onClick={() => store.dispatch(reconnectViaServer(peer.peerId, peer.name))}>Reconnect</button>
      )}
      {!peer.online && peer.email && (
        <a className="nav-link" href={`mailto:${peer.email}`}>Invite</a>
      )}
      {!peer.online && !peer.email && (
        <form onSubmit={handleEmailSubmit}>
          <input
            className="field"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            placeholder="Enter email"
          />
        </form>
      )}
      <button className="control" onClick={() => store.dispatch(forgetPeer(peer.peerId))}>Forget</button>
    </article>
  );
};

const countSummary = (connected: number, online: number, previous: number): string => {
  const parts = [];
  if (connected > 0) parts.push(`${connected} connected`);
  if (online > 0) parts.push(`${online} online`);
  if (previous > 0) parts.push(`${previous} previous`);
  return parts.join(', ');
};

export const Fleet = () => {
  const store = useConnectionStore();
  const peers = useConnectionState(selectPeers);
  const peerConnectionHealth = useConnectionState(selectPeerConnectionHealth);
  const pendingIntroductions = useConnectionState(selectPendingIntroductions);
  const onlinePeers = useConnectionState(selectOnlinePeers);
  const previousPeers = useConnectionState(selectPreviousPeers);

  const trustingPeers = peers.filter(p => p.trustsMe);
  const summary = countSummary(peers.length, onlinePeers.length, previousPeers.length);

  return (
    <nav className="hud-fleet" aria-label="Fleet">
      <details open>
        <summary className="fleet-summary">
          Fleet <output className="fleet-count" aria-live="polite">{summary}</output>
        </summary>

        {peers.length > 0 && (
          <section className="fleet-section" aria-labelledby="fleet-connected">
            <h2 className="fleet-section-heading" id="fleet-connected">Connected</h2>
            <ul>
              {peers.map(peer => (
                <li key={peer.id}>
                  <PeerCard
                    peer={peer}
                    otherTrustingPeers={trustingPeers.filter(p => p.id !== peer.id)}
                    unstable={peerConnectionHealth[peer.id] === 'unstable'}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {onlinePeers.length > 0 && (
          <section className="fleet-section" aria-labelledby="fleet-online">
            <h2 className="fleet-section-heading" id="fleet-online">Online</h2>
            <ul aria-label="Online peers">
              {onlinePeers.map(peer => (
                <li key={peer.peerId}>
                  <strong className="fleet-peer-name">{peer.name}</strong>
                  <button className="control" onClick={() => store.dispatch(connectViaServer(peer.peerId, peer.name))}>Connect</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {previousPeers.length > 0 && (
          <section className="fleet-section" aria-labelledby="fleet-previous">
            <h2 className="fleet-section-heading" id="fleet-previous">Previous</h2>
            <ul aria-label="Previous peers">
              {previousPeers.map(peer => (
                <li key={peer.peerId}>
                  <PreviousPeerCard peer={peer}/>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pendingIntroductions.length > 0 && (
          <section className="fleet-section" aria-labelledby="fleet-introductions">
            <h2 className="fleet-section-heading" id="fleet-introductions">Introductions</h2>
            <ul>
              {pendingIntroductions.map(intro => (
                <li key={intro.introId}>
                  {intro.from} wants to introduce you to {intro.peer}
                  <button className="control" onClick={() => store.dispatch(acceptIntroduction(intro.introId))}>Accept</button>
                  <button className="control" onClick={() => store.dispatch(declineIntroduction(intro.introId))}>Decline</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </details>
    </nav>
  );
};
