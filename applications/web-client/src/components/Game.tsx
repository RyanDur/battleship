import {useState, useEffect, useRef} from 'react';
import {useConnectionState, useConnectionStore} from '../state/useConnection';
import {selectGameView, selectP2pGame} from '../state/connectionSelectors';
import {fireShot, p2pFire} from '../state/connectionActions';

const ROWS = Array.from({length: 10}, (_, i) => i + 1);
const COLS = Array.from({length: 10}, (_, i) => i + 1);

type Props = {
  onNewGame: () => void;
};

export const Game = ({onNewGame}: Props) => {
  const gameView = useConnectionState(selectGameView);
  const p2pGame = useConnectionState(selectP2pGame);
  const store = useConnectionStore();
  const [announcement, setAnnouncement] = useState('');
  const prevShotCountRef = useRef(0);

  useEffect(() => {
    if (!gameView) return;
    const newShots = gameView.myShots.slice(prevShotCountRef.current);
    const sunk = newShots.find(s => s.result === 'sunk' && s.ship);
    if (sunk?.ship) setAnnouncement(`${sunk.ship.name} sunk!`);
    prevShotCountRef.current = gameView.myShots.length;
  }, [gameView]);

  const handleFire = ({row, col}: {row: number; col: number}) => {
    if (gameView?.phase !== 'my-turn') return;
    if (p2pGame) {
      store.dispatch(p2pFire(row, col));
    } else {
      store.dispatch(fireShot(row, col));
    }
  };

  if (!gameView) return null;

  const isOver = gameView.phase === 'won' || gameView.phase === 'lost';
  const turnStatus = gameView.phase === 'my-turn' ? 'Your turn' : gameView.phase === 'their-turn' ? 'Waiting for opponent' : '';
  const statusText = announcement || turnStatus;

  const shotFor = (shots: typeof gameView.myShots, row: number, col: number) =>
    shots.find(s => s.cell.row === row && s.cell.col === col);

  return (
    <div className="game">
      <div role="status" className="game-announcement">{statusText}</div>

      {isOver && (
        <div className="game-over">
          <h2>{gameView.phase === 'won' ? 'You win!' : `${gameView.opponentName} wins`}</h2>
          <button className="control" onClick={onNewGame}>New game</button>
        </div>
      )}

      <section aria-label="Your fleet" className="game-board">
        {ROWS.flatMap(row =>
          COLS.map(col => {
            const shot = shotFor(gameView.opponentShots, row, col);
            return (
              <button
                key={`fleet-${row}-${col}`}
                aria-label={`Row ${row}, Column ${col}`}
                className={`game-cell${shot ? ` ${shot.result}` : ''}`}
                disabled
              >
                {shot?.result}
              </button>
            );
          })
        )}
      </section>

      <section aria-label="Tracking board" className="game-board">
        {ROWS.flatMap(row =>
          COLS.map(col => {
            const shot = shotFor(gameView.myShots, row, col);
            return (
              <button
                key={`track-${row}-${col}`}
                aria-label={`Row ${row}, Column ${col}`}
                className={`game-cell${shot ? ` ${shot.result}` : ''}`}
                disabled={!!shot || isOver || gameView.phase !== 'my-turn'}
                onClick={() => handleFire({row, col})}
              >
                {shot?.result}
              </button>
            );
          })
        )}
      </section>
    </div>
  );
};
