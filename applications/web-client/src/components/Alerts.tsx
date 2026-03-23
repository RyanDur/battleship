import {useConnectionState, useConnectionStore} from '../state/useConnection';
import {selectPendingIntroductions, selectP2pGame, selectPeers} from '../state/connectionSelectors';
import {acceptIntroduction, declineIntroduction, acceptChallenge, declineChallenge} from '../state/connectionActions';

export const Alerts = () => {
  const store = useConnectionStore();
  const pendingIntroductions = useConnectionState(selectPendingIntroductions);
  const p2pGame = useConnectionState(selectP2pGame);
  const peers = useConnectionState(selectPeers);

  const challengeReceived = p2pGame?.phase === 'challenge-received' ? p2pGame : null;
  const challengerName = challengeReceived
    ? (peers.find(p => p.id === challengeReceived.opponentId)?.name ?? 'Someone')
    : null;

  const count = pendingIntroductions.length + (challengeReceived ? 1 : 0);

  return (
    <details className="alerts-details" open aria-label="Alerts">
      <summary className="alerts-summary">
        Alerts
        <output className="alerts-count" aria-live="assertive">{count > 0 ? String(count) : ''}</output>
      </summary>

      {count > 0 && (
        <ul className="alerts-list">
          {challengeReceived && (
            <li key="challenge">
              <article className="alerts-alert">
                {challengerName} wants to play you
                <button className="control" onClick={() => store.dispatch(acceptChallenge())}>Accept</button>
                <button className="control" onClick={() => store.dispatch(declineChallenge())}>Decline</button>
              </article>
            </li>
          )}
          {pendingIntroductions.map(intro => (
            <li key={intro.introId}>
              <article className="alerts-alert">
                {intro.from} wants to introduce you to {intro.peer}
                <button className="control" onClick={() => store.dispatch(acceptIntroduction(intro.introId))}>Accept</button>
                <button className="control" onClick={() => store.dispatch(declineIntroduction(intro.introId))}>Decline</button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
};
