export type ShipName = 'Carrier' | 'Battleship' | 'Cruiser' | 'Submarine' | 'Destroyer';

export type Orientation = 'horizontal' | 'vertical';

export type Cell = {row: number; col: number};

export type Ship = {name: ShipName; size: number};

export type PlacedShip = {ship: Ship; position: Cell; orientation: Orientation};

export type Board = {placed: readonly PlacedShip[]};

export const SHIPS: readonly Ship[] = [
  {name: 'Carrier', size: 5},
  {name: 'Battleship', size: 4},
  {name: 'Cruiser', size: 3},
  {name: 'Submarine', size: 3},
  {name: 'Destroyer', size: 2},
];

const BOARD_SIZE = 10;

export const occupiedCells = ({ship, position, orientation}: PlacedShip): Cell[] =>
  Array.from({length: ship.size}, (_, i) => ({
    row: orientation === 'vertical' ? position.row + i : position.row,
    col: orientation === 'horizontal' ? position.col + i : position.col,
  }));

const inBounds = ({row, col}: Cell): boolean =>
  row >= 1 && row <= BOARD_SIZE && col >= 1 && col <= BOARD_SIZE;

const cellsEqual = (a: Cell, b: Cell): boolean => a.row === b.row && a.col === b.col;

export const canPlace = (board: Board, ship: Ship, position: Cell, orientation: Orientation): boolean => {
  const candidate: PlacedShip = {ship, position, orientation};
  const cells = occupiedCells(candidate);
  if (!cells.every(inBounds)) return false;
  const taken = board.placed.flatMap(occupiedCells);
  return !cells.some(cell => taken.some(t => cellsEqual(t, cell)));
};

export const placeShip = (board: Board, ship: Ship, position: Cell, orientation: Orientation): Board | null => {
  if (!canPlace(board, ship, position, orientation)) return null;
  return {placed: [...board.placed, {ship, position, orientation}]};
};

export const remainingShips = (board: Board): readonly Ship[] => {
  const placed = new Set(board.placed.map(p => p.ship.name));
  return SHIPS.filter(s => !placed.has(s.name));
};

export const isComplete = (board: Board): boolean => board.placed.length === SHIPS.length;

export const isCellOccupied = (board: Board, cell: Cell): boolean =>
  board.placed.flatMap(occupiedCells).some(c => cellsEqual(c, cell));