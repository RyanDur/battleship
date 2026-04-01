import {useState, useCallback, useEffect} from 'react';
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
  type PlacedShip,
} from './board';

const ROWS = Array.from({length: 10}, (_, i) => i + 1);
const COLS = Array.from({length: 10}, (_, i) => i + 1);
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const cellsEqual = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;

type DragOrigin = 'list' | {position: Cell; orientation: Orientation};

type DragState = {
  ship: Ship;
  orientation: Orientation;
  origin: DragOrigin;
};

type Props = {
  onConfirm: (board: Board) => void;
};

const placedShipAtCell = (board: Board, cell: Cell): PlacedShip | null =>
  board.placed.find(p => occupiedCells(p).some(c => cellsEqual(c, cell))) ?? null;

const removeShipFromBoard = (board: Board, shipName: string): Board => ({
  placed: board.placed.filter(p => p.ship.name !== shipName),
});

const rotateShipInPlace = (board: Board, placed: PlacedShip): Board | null => {
  const next: Orientation = placed.orientation === 'horizontal' ? 'vertical' : 'horizontal';
  const boardWithout = removeShipFromBoard(board, placed.ship.name);
  if (!canPlace(boardWithout, placed.ship, placed.position, next)) return null;
  return placeShip(boardWithout, placed.ship, placed.position, next);
};

export const BoardSetup = ({onConfirm}: Props) => {
  const [board, setBoard] = useState<Board>({placed: []});
  const [selected, setSelected] = useState<Ship | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);

  const isDragging = dragState !== null;

  // Board state during drag: if we picked up a ship from the board, show it without that ship
  const boardDuringDrag: Board = isDragging && dragState.origin !== 'list'
    ? removeShipFromBoard(board, dragState.ship.name)
    : board;

  const remaining = remainingShips(boardDuringDrag);

  const dragOrientation = dragState?.orientation ?? orientation;

  const activeShip = dragState?.ship ?? selected;
  const activeOrientation = dragOrientation;

  const previewCells: Cell[] = activeShip && hoveredCell
    ? occupiedCells({ship: activeShip, position: hoveredCell, orientation: activeOrientation})
    : [];

  const isValidPreview = activeShip && hoveredCell
    ? canPlace(boardDuringDrag, activeShip, hoveredCell, activeOrientation)
    : false;

  // Cells that belong to the ship being dragged from the board (shown with drag-source opacity)
  const dragSourceCells: Cell[] = isDragging && dragState.origin !== 'list'
    ? occupiedCells({ship: dragState.ship, position: dragState.origin.position, orientation: dragState.origin.orientation})
    : [];

  const cellClassName = (row: number, col: number): string => {
    const cell: Cell = {row, col};
    const occupied = isCellOccupied(boardDuringDrag, cell);
    const inPreview = previewCells.some(p => cellsEqual(p, cell));
    const isDragSource = dragSourceCells.some(c => cellsEqual(c, cell));
    const classes = ['board-setup-cell'];
    if (occupied) classes.push('occupied');
    if (inPreview && isValidPreview) classes.push('preview');
    if (inPreview && !isValidPreview) classes.push('preview-invalid');
    if (isDragSource) classes.push('drag-source');
    return classes.join(' ');
  };

  const toggleOrientation = useCallback(() => {
    if (isDragging) {
      setDragState(prev => prev
        ? {...prev, orientation: prev.orientation === 'horizontal' ? 'vertical' : 'horizontal'}
        : null);
    } else {
      setOrientation(o => o === 'horizontal' ? 'vertical' : 'horizontal');
    }
  }, [isDragging]);

  // Global keydown for R (rotate) and Escape (cancel / deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setDragState(null);
        setHoveredCell(null);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        toggleOrientation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // ── Ship list handlers ──────────────────────────────────────────────────────

  const handleShipClick = (ship: Ship) => () => {
    setSelected(prev => prev?.name === ship.name ? null : ship);
  };

  const handleShipDragStart = (ship: Ship) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ship, orientation, origin: 'list'});
    setSelected(null);
  };

  const handleShipDragEnd = () => {
    // If drag was cancelled (not dropped on a valid target), restore state
    setDragState(null);
    setHoveredCell(null);
  };

  // ── Grid cell handlers ──────────────────────────────────────────────────────

  const handleCellDragStart = (row: number, col: number) => (e: React.DragEvent) => {
    const cell: Cell = {row, col};
    const placed = placedShipAtCell(board, cell);
    if (!placed) return;
    e.dataTransfer.effectAllowed = 'move';
    setBoard(removeShipFromBoard(board, placed.ship.name));
    setDragState({
      ship: placed.ship,
      orientation: placed.orientation,
      origin: {position: placed.position, orientation: placed.orientation},
    });
    setSelected(null);
  };

  const handleCellDragOver = (row: number, col: number) => (e: React.DragEvent) => {
    if (!dragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredCell(prev => (prev?.row === row && prev?.col === col) ? prev : {row, col});
  };

  const handleCellDrop = (row: number, col: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragState) return;
    const cell: Cell = {row, col};
    const next = placeShip(boardDuringDrag, dragState.ship, cell, dragState.orientation);
    if (next) {
      setBoard(next);
      setDragState(null);
      setHoveredCell(null);
    }
  };

  const handleCellDragLeave = () => {
    setHoveredCell(null);
  };

  const handleCellDragEnd = () => {
    // Drag ended without a valid drop — restore the ship to its original position
    setDragState(prev => {
      if (prev && prev.origin !== 'list') {
        const origin = prev.origin;
        setBoard(b => {
          const restored = placeShip(
            removeShipFromBoard(b, prev.ship.name),
            prev.ship,
            origin.position,
            origin.orientation,
          );
          return restored ?? b;
        });
      }
      return null;
    });
    setHoveredCell(null);
  };

  const handleCellClick = (row: number, col: number) => () => {
    const cell: Cell = {row, col};

    // Click on occupied cell → rotate in place
    if (isCellOccupied(board, cell)) {
      const placed = placedShipAtCell(board, cell);
      if (placed) {
        const rotated = rotateShipInPlace(board, placed);
        if (rotated) setBoard(rotated);
      }
      return;
    }

    // Click on empty cell with selected ship → place it
    if (selected) {
      const next = placeShip(board, selected, cell, orientation);
      if (next) {
        setBoard(next);
        setSelected(null);
      }
    }
  };

  const handleCellKeyDown = (row: number, col: number) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    if (isDragging) return;
    if (!selected) return;
    const cell: Cell = {row, col};
    const next = placeShip(board, selected, cell, orientation);
    if (next) {
      setBoard(next);
      setSelected(null);
    }
  };

  const handleCellFocus = (row: number, col: number) => () => {
    setHoveredCell({row, col});
  };

  const handleCellBlur = () => {
    setHoveredCell(null);
  };

  const isOccupied = (row: number, col: number) =>
    isCellOccupied(boardDuringDrag, {row, col});

  const isDragSourceShip = (ship: Ship) =>
    isDragging && dragState.ship.name === ship.name && dragState.origin === 'list';

  return (
    <div className="board-setup">
      <section
        aria-label="Place your ships"
        className="board-setup-grid"
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
              draggable={isOccupied(row, col)}
              onDragStart={isOccupied(row, col) ? handleCellDragStart(row, col) : undefined}
              onDragOver={handleCellDragOver(row, col)}
              onDrop={handleCellDrop(row, col)}
              onDragLeave={handleCellDragLeave}
              onDragEnd={isOccupied(row, col) ? handleCellDragEnd : undefined}
              onClick={handleCellClick(row, col)}
              onFocus={handleCellFocus(row, col)}
              onBlur={handleCellBlur}
              onKeyDown={handleCellKeyDown(row, col)}
            />
          )),
        ])}
      </section>

      <div className="board-setup-controls">
        <button className="control" onClick={toggleOrientation}>
          Rotate ({isDragging ? dragOrientation : orientation})
        </button>

        <ul aria-label="Ships remaining" className="board-setup-ships">
          {remaining.map(ship => (
            <li key={ship.name}>
              <button
                className={`control${isDragSourceShip(ship) ? ' drag-source' : ''}`}
                aria-pressed={selected?.name === ship.name}
                draggable
                onDragStart={handleShipDragStart(ship)}
                onDragEnd={handleShipDragEnd}
                onClick={handleShipClick(ship)}
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
