import {useState} from 'react';
import {
  placeShip,
  remainingShips,
  isComplete,
  isCellOccupied,
  type Board,
  type Ship,
  type Orientation,
} from './board';

const ROWS = Array.from({length: 10}, (_, i) => i + 1);
const COLS = Array.from({length: 10}, (_, i) => i + 1);

type Props = {
  onConfirm: (board: Board) => void;
};

export const BoardSetup = ({onConfirm}: Props) => {
  const [board, setBoard] = useState<Board>({placed: []});
  const [selected, setSelected] = useState<Ship | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');

  const remaining = remainingShips(board);

  const handleCellClick = (row: number, col: number) => {
    if (!selected) return;
    const next = placeShip(board, selected, {row, col}, orientation);
    if (!next) return;
    setBoard(next);
    setSelected(null);
  };

  const toggleOrientation = () =>
    setOrientation(o => o === 'horizontal' ? 'vertical' : 'horizontal');

  return (
    <div className="board-setup">
      <section aria-label="Place your ships" className="board-setup-grid">
        {ROWS.flatMap(row =>
          COLS.map(col => (
            <button
              key={`${row}-${col}`}
              aria-label={`Row ${row}, Column ${col}`}
              className={`board-setup-cell${isCellOccupied(board, {row, col}) ? ' occupied' : ''}`}
              onClick={() => handleCellClick(row, col)}
            />
          ))
        )}
      </section>

      <div className="board-setup-controls">
        <button className="control" onClick={toggleOrientation}>
          Rotate ({orientation})
        </button>

        <ul aria-label="Ships remaining" className="board-setup-ships">
          {remaining.map(ship => (
            <li key={ship.name}>
              <button
                className="control"
                aria-pressed={selected?.name === ship.name}
                onClick={() => setSelected(ship)}
              >
                {ship.name} ({ship.size})
              </button>
            </li>
          ))}
        </ul>

        {isComplete(board) && (
          <button className="control" onClick={() => onConfirm(board)}>
            Confirm placement
          </button>
        )}
      </div>
    </div>
  );
};
