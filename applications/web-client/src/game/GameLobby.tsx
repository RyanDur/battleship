import {takeFirstTurn, p2pBoardReady, claimFirstTurn} from './gameActions';
import {useGameStore, useGameState} from './useGame';
import {selectP2pGame, selectOpponentNames, selectBoard} from './gameSelectors';
import {hashBoard} from './hashBoard';

type Props = {
  onSetupBoard: () => void;
};

export const GameLobby = ({onSetupBoard}: Props) => {
  const p2pGame = useGameState(selectP2pGame);
  const opponentNames = useGameState(selectOpponentNames);
  const board = useGameState(selectBoard);
  const gameStore = useGameStore();

  if (!p2pGame) return null;

  const opponentName = opponentNames[p2pGame.opponentId] ?? 'Opponent';

  const handleUseBoard = () => {
    if (!board) return;
    hashBoard(board).onSuccess(hash => gameStore.dispatch(p2pBoardReady(hash)));
  };

  return (
    <section aria-label={`Game vs ${opponentName}`} className="game-lobby">
      {p2pGame.phase === 'placing' && (
        <>
          {!p2pGame.myBoardReady && (
            board
              ? <>
                  <button className="control" onClick={handleUseBoard}>Use this board</button>
                  <button className="control" onClick={onSetupBoard}>Re-place ships</button>
                </>
              : <button className="control" onClick={onSetupBoard}>Place ships</button>
          )}
          {p2pGame.myBoardReady && !p2pGame.opponentBoardReady && (
            <p className="lobby-status">Waiting for {opponentName}...</p>
          )}
        </>
      )}
      {p2pGame.phase === 'selecting-turn' && (
        <>
          <button className="control" onClick={() => gameStore.dispatch(takeFirstTurn())}>Go first</button>
          <button className="control" onClick={() => gameStore.dispatch(claimFirstTurn())}>Flip coin</button>
        </>
      )}
    </section>
  );
};
