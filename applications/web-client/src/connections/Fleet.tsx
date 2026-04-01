import {useState} from 'react';
import {useSelector, useDispatch} from './useStore';
import type {Peer, PreviousPeer} from './connections';
import {selectPeers, selectOnlinePeers, selectPreviousPeers} from './connectionSelectors';
import {selectPeerConnectionHealth} from '../transport/transportSelectors';
import {reconnectViaServer, connectViaServer} from '../transport/transportActions';
import {introducePeers, revokeTrust, grantTrust, disconnect, savePeerEmail, forgetPeer} from './connectionActions';
import {challengePeer, cancelChallenge} from '../game/gameActions';
import {useOptionalGameState, useGameStore} from '../game/useGame';
import {selectP2pGame} from '../game/gameSelectors';

type SelectPeer = (id: string, name: string | null) => void;

const PeerCard = ({peer, otherTrustingPeers, unstable, onSelect}: {peer: Peer; otherTrustingPeers: Peer[]; unstable: boolean; onSelect?: SelectPeer}) => {
  const dispatch = useDispatch();
  const gameStore = useGameStore();
  const p2pGame = useOptionalGameState(selectP2pGame);
  const [introducing, setIntroducing] = useState(false);
  const showIntroduceButton = peer.trustsMe && otherTrustingPeers.length > 0;

  const isChallenging = p2pGame?.phase === 'challenged' && p2pGame.opponentId === peer.id;
  const showChallenge = !p2pGame || (p2pGame.opponentId !== peer.id && p2pGame.phase !== 'challenge-received');

  return (
    <article className="fleet-peer-card">
      <button className="fleet-peer-name" onClick={() => onSelect?.(peer.id, peer.name ?? null)}>{peer.name ?? 'Unknown'}</button>
      {unstable && <small className="fleet-peer-health">Reconnecting...</small>}
      {peer.trustsMe && (
        <abbr className="fleet-peer-trust" aria-label="Trusts you to introduce them">★</abbr>
      )}
      {isChallenging && (
        <>
          <button className="control" disabled>Waiting...</button>
          <button className="control" onClick={() => gameStore.dispatch(cancelChallenge())}>Cancel</button>
        </>
      )}
      {!isChallenging && showChallenge && (
        <button className="control" onClick={() => gameStore.dispatch(challengePeer(peer.id))}>Challenge</button>
      )}
      {showIntroduceButton && !introducing && (
        <button className="control" onClick={() => setIntroducing(true)}>Introduce</button>
      )}
      {introducing && otherTrustingPeers.map(other => (
        <button
          className="control"
          key={other.id}
          onClick={() => { dispatch(introducePeers(peer.id, other.id)); setIntroducing(false); }}
        >
          Introduce to {other.name ?? 'Unknown'}
        </button>
      ))}
      {peer.trusted
        ? <button className="control" onClick={() => dispatch(revokeTrust(peer.id))}>Revoke trust</button>
        : <button className="control" onClick={() => dispatch(grantTrust(peer.id))}>Trust</button>
      }
      <button className="control" onClick={() => dispatch(disconnect(peer.id))}>Disconnect</button>
    </article>
  );
};

const PreviousPeerCard = ({peer}: {peer: PreviousPeer}) => {
  const dispatch = useDispatch();
  const [emailInput, setEmailInput] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInput.trim()) {
      dispatch(savePeerEmail(peer.peerId, emailInput.trim()));
      setEmailInput('');
    }
  };

  return (
    <article className="fleet-peer-card">
      <strong className="fleet-peer-name">{peer.name}</strong>
      <small className="fleet-peer-status">{peer.online ? 'Online' : 'Offline'}</small>
      {peer.online && (
        <button className="control" onClick={() => dispatch(reconnectViaServer(peer.peerId, peer.name))}>Reconnect</button>
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
      <button className="control" onClick={() => dispatch(forgetPeer(peer.peerId))}>Forget</button>
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

type Props = {
  onSelectPeer?: SelectPeer;
}

export const Fleet = ({onSelectPeer}: Props = {}) => {
  const dispatch = useDispatch();
  const peers = useSelector(selectPeers);
  const peerConnectionHealth = useSelector(selectPeerConnectionHealth);
  const onlinePeers = useSelector(selectOnlinePeers);
  const previousPeers = useSelector(selectPreviousPeers);

  const trustingPeers = peers.filter(p => p.trustsMe);
  const summary = countSummary(peers.length, onlinePeers.length, previousPeers.length);

  return (
    <nav className="hud-fleet" aria-label="Fleet">
      <details className="fleet-details" open>
        <summary className="fleet-summary">
          Fleet <output className="fleet-count" aria-live="polite">{summary}</output>
        </summary>

        {peers.length > 0 && (
          <section className="fleet-section" aria-labelledby="fleet-connected">
            <h2 className="fleet-section-heading" id="fleet-connected">Connected</h2>
            <ul aria-label="Connected peers">
              {peers.map(peer => (
                <li key={peer.id}>
                  <PeerCard
                    peer={peer}
                    otherTrustingPeers={trustingPeers.filter(p => p.id !== peer.id)}
                    unstable={peerConnectionHealth[peer.id] === 'unstable'}
                    onSelect={onSelectPeer}
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
                  <button className="control" onClick={() => dispatch(connectViaServer(peer.peerId, peer.name))}>Connect</button>
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

      </details>
    </nav>
  );
};
