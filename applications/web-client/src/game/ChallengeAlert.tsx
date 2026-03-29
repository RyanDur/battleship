import {useGameState, useGameStore} from './useGame';
import {acceptChallenge, declineChallenge} from './gameActions';
import {selectP2pGame, selectOpponentNames} from './gameSelectors';

export const ChallengeAlert = () => {
  const store = useGameStore();
  const p2pGame = useGameState(selectP2pGame);
  const opponentNames = useGameState(selectOpponentNames);

  if (p2pGame?.phase !== 'challenge-received') return null;

  const opponentName = opponentNames[p2pGame.opponentId] ?? 'Someone';

  return (
    <article className="alerts-alert">
      {opponentName} wants to play you
      <button className="control" onClick={() => store.dispatch(acceptChallenge())}>Accept</button>
      <button className="control" onClick={() => store.dispatch(declineChallenge())}>Decline</button>
    </article>
  );
};
