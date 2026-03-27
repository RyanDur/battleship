import {SHIPS, occupiedCells, isCellOccupied, canPlace} from './board';
import type {Board, Cell, Orientation, PlacedShip} from './board';
import type {Shot, AiGamePhase} from './game';

const BOARD_SIZE = 10;
const TOTAL_SHIPS = 5;

const allCells = (): Cell[] =>
  Array.from({length: BOARD_SIZE}, (_, r) =>
    Array.from({length: BOARD_SIZE}, (_, c) => ({row: r + 1, col: c + 1}))
  ).flat();

const randomInt = (max: number): number => Math.floor(Math.random() * max);

const randomOrientation = (): Orientation =>
  randomInt(2) === 0 ? 'horizontal' : 'vertical';

export const randomBoard = (): Board => {
  let board: Board = {placed: []};
  for (const ship of SHIPS) {
    let placed = false;
    while (!placed) {
      const row = randomInt(BOARD_SIZE) + 1;
      const col = randomInt(BOARD_SIZE) + 1;
      const orientation = randomOrientation();
      if (canPlace(board, ship, {row, col}, orientation)) {
        board = {placed: [...board.placed, {ship, position: {row, col}, orientation}]};
        placed = true;
      }
    }
  }
  return board;
};

export const nextAiShot = (fired: Shot[]): Cell => {
  const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
  const available = allCells().filter(c => !firedSet.has(`${c.row},${c.col}`));
  return available[randomInt(available.length)];
};

const resolveShot = (board: Board, prevShots: Shot[], cell: Cell): Shot => {
  if (!isCellOccupied(board, cell)) return {cell, result: 'miss'};
  const placedShip = board.placed.find((p: PlacedShip) =>
    occupiedCells(p).some(c => c.row === cell.row && c.col === cell.col)
  );
  if (!placedShip) return {cell, result: 'hit'};
  const shipCells = occupiedCells(placedShip);
  const hitCells = [...prevShots.map(s => s.cell), cell];
  const isSunk = shipCells.every(c => hitCells.some(h => h.row === c.row && h.col === c.col));
  return isSunk
    ? {cell, result: 'sunk', ship: {name: placedShip.ship.name, size: placedShip.ship.size}}
    : {cell, result: 'hit'};
};

const sunkShipName = (shot: Shot): string | null =>
  shot.result === 'sunk' && shot.ship ? shot.ship.name : null;

const isFleetSunk = (shots: Shot[]): boolean => {
  const names = shots.map(sunkShipName).filter((name): name is string => name !== null);
  return new Set(names).size >= TOTAL_SHIPS;
};

export type FireResult = {
  playerShot: Shot
  aiShot: Shot | null
  phase: AiGamePhase
}

export const resolveFireShot = (
  aiBoard: Board,
  playerBoard: Board,
  playerShots: Shot[],
  aiShots: Shot[],
  cell: Cell,
): FireResult => {
  const playerShot = resolveShot(aiBoard, playerShots, cell);
  const updatedPlayerShots = [...playerShots, playerShot];

  if (isFleetSunk(updatedPlayerShots)) {
    return {playerShot, aiShot: null, phase: 'player-won'};
  }

  const aiCell = nextAiShot(aiShots);
  const aiShot = resolveShot(playerBoard, aiShots, aiCell);
  const updatedAiShots = [...aiShots, aiShot];

  if (isFleetSunk(updatedAiShots)) {
    return {playerShot, aiShot, phase: 'computer-won'};
  }

  return {playerShot, aiShot, phase: 'player-turn'};
};
