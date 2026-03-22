import {useState, useEffect, useRef} from 'react';
import {useConnectionState, useConnectionStore} from '../state/useConnection';
import {selectGameState} from '../state/connectionSelectors';
import {fireShot as fireShotAction} from '../state/connectionActions';

const ROWS = Array.from({length: 10}, (_, i) => i + 1);
const COLS = Array.from({length: 10}, (_, i) => i + 1);

type Props = {
  onNewGame: () => void;
};

export const Game = ({onNewGame}: Props) => {
  const state = useConnectionState(selectGameState);
  const store = useConnectionStore();
  const [announcement, setAnnouncement] = useState('');
  const prevShotCountRef = useRef(0);

  useEffect(() => {
    if (!state) return;
    const newShots = state.playerShots.slice(prevShotCountRef.current);
    const sunk = newShots.find(s => s.result === 'sunk' && s.ship);
    if (sunk?.ship) setAnnouncement(`${sunk.ship.name} sunk!`);
    prevShotCountRef.current = state.playerShots.length;
  }, [state]);

  const handleFire = ({row, col}: {row: number; col: number}) => {
    if (state?.phase !== 'player-turn') return;
    store.dispatch(fireShotAction(row, col));
  };

  if (!state) return null;

  const isOver = state.phase === 'player-won' || state.phase === 'computer-won';

  const shotFor = (shots: typeof state.playerShots, row: number, col: number) =>
    shots.find(s => s.cell.row === row && s.cell.col === col);

  return (
    <div className="game">
      <div role="status" className="game-announcement">{announcement}</div>

      {isOver && (
        <div className="game-over">
          <h2>{state.phase === 'player-won' ? 'You win!' : 'Computer wins'}</h2>
          <button className="control" onClick={onNewGame}>New game</button>
        </div>
      )}

      <section aria-label="Your fleet" className="game-board">
        {ROWS.flatMap(row =>
          COLS.map(col => {
            const shot = shotFor(state.aiShots, row, col);
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
            const shot = shotFor(state.playerShots, row, col);
            return (
              <button
                key={`track-${row}-${col}`}
                aria-label={`Row ${row}, Column ${col}`}
                className={`game-cell${shot ? ` ${shot.result}` : ''}`}
                disabled={!!shot || isOver || state.phase !== 'player-turn'}
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
