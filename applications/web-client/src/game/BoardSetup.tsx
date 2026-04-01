import {useState} from 'react';
import {
  placeShip,
  remainingShips,
  isComplete,
  isCellOccupied,
  occupiedCells,
  canPlace,
  type Board,
  type Ship,
  type Orientation,
  type Cell,
} from './board';

const ROWS = Array.from({length: 10}, (_, i) => i + 1);
const COLS = Array.from({length: 10}, (_, i) => i + 1);
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const cellsEqual = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;

type Props = {
  onConfirm: (board: Board) => void;
};

export const BoardSetup = ({onConfirm}: Props) => {
  const [board, setBoard] = useState<Board>({placed: []});
  const [selected, setSelected] = useState<Ship | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);

  const remaining = remainingShips(board);

  const previewCells = selected && hoveredCell
    ? occupiedCells({ship: selected, position: hoveredCell, orientation})
    : [];

  const isValidPreview = selected && hoveredCell
    ? canPlace(board, selected, hoveredCell, orientation)
    : false;

  const cellClassName = (row: number, col: number): string => {
    const cell: Cell = {row, col};
    if (isCellOccupied(board, cell)) return 'board-setup-cell occupied';
    const inPreview = previewCells.some(p => cellsEqual(p, cell));
    if (inPreview && isValidPreview) return 'board-setup-cell preview';
    if (inPreview && !isValidPreview) return 'board-setup-cell preview-invalid';
    return 'board-setup-cell';
  };

  const handleCellClick = (row: number, col: number) => {
    if (!selected) return;
    const next = placeShip(board, selected, {row, col}, orientation);
    if (!next) return;
    setBoard(next);
    setSelected(null);
  };

  const toggleOrientation = () =>
    setOrientation(o => o === 'horizontal' ? 'vertical' : 'horizontal');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'r' || e.key === 'R') toggleOrientation();
  };

  return (
    <div className="board-setup">
      <section
        aria-label="Place your ships"
        className="board-setup-grid"
        onKeyDown={handleKeyDown}
      >
        <span className="board-label" aria-hidden="true" />
        {COL_LABELS.map(letter => (
          <span key={`setup-col-${letter}`} className="board-label" aria-hidden="true">{letter}</span>
        ))}
        {ROWS.flatMap(row => [
          <span key={`setup-row-${row}`} className="board-label" aria-hidden="true">{row}</span>,
          ...COLS.map(col => (
            <button
              key={`${row}-${col}`}
              aria-label={`Row ${row}, Column ${col}`}
              className={cellClassName(row, col)}
              onClick={() => handleCellClick(row, col)}
              onMouseEnter={() => setHoveredCell({row, col})}
              onMouseLeave={() => setHoveredCell(null)}
              onFocus={() => setHoveredCell({row, col})}
              onBlur={() => setHoveredCell(null)}
            />
          )),
        ])}
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
