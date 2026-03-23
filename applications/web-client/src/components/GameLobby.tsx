import {useConnectionState, useConnectionStore} from '../state/useConnection';
import {selectP2pGame, selectPeers, selectBoard} from '../state/connectionSelectors';
import {p2pBoardReady, claimFirstTurn} from '../state/connectionActions';
import {hashBoard} from '../game/hashBoard';

export const GameLobby = () => {
  const p2pGame = useConnectionState(selectP2pGame);
  const peers = useConnectionState(selectPeers);
  const board = useConnectionState(selectBoard);
  const store = useConnectionStore();

  if (!p2pGame) return null;

  const opponentName = peers.find(p => p.id === p2pGame.opponentId)?.name ?? 'Opponent';

  const handleUseBoard = () => {
    if (!board) return;
    hashBoard(board).onSuccess(hash => store.dispatch(p2pBoardReady(hash)));
  };

  return (
    <section aria-label={`Game vs ${opponentName}`} className="game-lobby">
      {p2pGame.phase === 'placing' && (
        <>
          {!p2pGame.myBoardReady && (
            <button className="control" onClick={handleUseBoard}>Use this board</button>
          )}
          {p2pGame.myBoardReady && !p2pGame.opponentBoardReady && (
            <p className="lobby-status">Waiting for {opponentName}...</p>
          )}
        </>
      )}
      {p2pGame.phase === 'selecting-turn' && (
        <button className="control" onClick={() => store.dispatch(claimFirstTurn())}>Go first</button>
      )}
    </section>
  );
};
