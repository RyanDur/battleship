import {useState, useEffect, useRef} from 'react';
import {useConnectionState, useConnectionStore} from '../state/useConnection';
import {selectGameState} from '../state/connectionSelectors';
import {fireShot as fireShotAction} from '../state/connectionActions';
import type {GameState} from '../state/connections';

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

  const gameState: GameState = state;

  const isOver = gameState.phase === 'player-won' || gameState.phase === 'computer-won';

  const shotFor = (shots: GameState['playerShots'], row: number, col: number) =>
    shots.find(s => s.cell.row === row && s.cell.col === col);

  return (
    <div className="game">
      <div role="status" className="game-announcement">{announcement}</div>

      {isOver && (
        <div className="game-over">
          <h2>{gameState.phase === 'player-won' ? 'You win!' : 'Computer wins'}</h2>
          <button className="control" onClick={onNewGame}>New game</button>
        </div>
      )}

      <section aria-label="Your fleet" className="game-board">
        {ROWS.flatMap(row =>
          COLS.map(col => {
            const shot = shotFor(gameState.aiShots, row, col);
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
            const shot = shotFor(gameState.playerShots, row, col);
            return (
              <button
                key={`track-${row}-${col}`}
                aria-label={`Row ${row}, Column ${col}`}
                className={`game-cell${shot ? ` ${shot.result}` : ''}`}
                disabled={!!shot || isOver || gameState.phase !== 'player-turn'}
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
