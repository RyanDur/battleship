import {SHIPS, occupiedCells, isCellOccupied, canPlace} from './board';
import type {Board, Cell, Orientation, PlacedShip, Ship} from './board';
import type {Shot, AiGamePhase} from './game';

export type AiDifficulty = 'easy' | 'normal' | 'hard'

export type AiStrategy = (fired: Shot[]) => Cell

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

const adjacentCells = (cell: Cell): Cell[] => [
  {row: cell.row - 1, col: cell.col},
  {row: cell.row + 1, col: cell.col},
  {row: cell.row, col: cell.col - 1},
  {row: cell.row, col: cell.col + 1},
].filter(c => c.row >= 1 && c.row <= BOARD_SIZE && c.col >= 1 && c.col <= BOARD_SIZE);

export const huntTargetShot = (fired: Shot[]): Cell => {
  const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
  const hits = fired.filter(s => s.result === 'hit');
  const targets = hits.flatMap(s => adjacentCells(s.cell)).filter(c => !firedSet.has(`${c.row},${c.col}`));
  if (targets.length > 0) return targets[randomInt(targets.length)];
  const available = allCells().filter(c => !firedSet.has(`${c.row},${c.col}`));
  return available[randomInt(available.length)];
};

const sunkShipNames = (fired: Shot[]): Set<string> =>
  new Set(fired.filter(s => s.result === 'sunk' && s.ship).map(s => s.ship!.name));

const aliveSunkShips = (fired: Shot[]): Ship[] => {
  const sunk = sunkShipNames(fired);
  return SHIPS.filter(s => !sunk.has(s.name));
};

const placementCells = (ship: Ship, position: Cell, orientation: Orientation): Cell[] => {
  const placed: PlacedShip = {ship, position, orientation};
  return occupiedCells(placed);
};

export const probabilityShot = (fired: Shot[]): Cell => {
  const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
  const missSet = new Set(fired.filter(s => s.result === 'miss').map(s => `${s.cell.row},${s.cell.col}`));
  const sunkSet = new Set(fired.filter(s => s.result === 'sunk').map(s => `${s.cell.row},${s.cell.col}`));
  const hitSet = new Set(fired.filter(s => s.result === 'hit').map(s => `${s.cell.row},${s.cell.col}`));
  const aliveShips = aliveSunkShips(fired);
  const density: Record<string, number> = {};

  const orientations: Orientation[] = ['horizontal', 'vertical'];
  for (const ship of aliveShips) {
    for (let row = 1; row <= BOARD_SIZE; row++) {
      for (let col = 1; col <= BOARD_SIZE; col++) {
        for (const orientation of orientations) {
          const cells = placementCells(ship, {row, col}, orientation);
          if (cells.length !== ship.size) continue;
          if (cells.some(c => c.row < 1 || c.row > BOARD_SIZE || c.col < 1 || c.col > BOARD_SIZE)) continue;
          if (cells.some(c => missSet.has(`${c.row},${c.col}`) || sunkSet.has(`${c.row},${c.col}`))) continue;
          const hasHit = cells.some(c => hitSet.has(`${c.row},${c.col}`));
          const weight = hasHit ? 3 : 1;
          for (const c of cells) {
            if (!firedSet.has(`${c.row},${c.col}`)) {
              const key = `${c.row},${c.col}`;
              density[key] = (density[key] ?? 0) + weight;
            }
          }
        }
      }
    }
  }

  const entries = Object.entries(density);
  if (entries.length === 0) return nextAiShot(fired);
  const maxCount = Math.max(...entries.map(([, v]) => v));
  const best = entries.filter(([, v]) => v === maxCount).map(([k]) => {
    const [r, c] = k.split(',').map(Number);
    return {row: r, col: c};
  });
  return best[randomInt(best.length)];
};

export const createAiStrategy = (difficulty: AiDifficulty): AiStrategy => {
  if (difficulty === 'normal') return huntTargetShot;
  if (difficulty === 'hard') return probabilityShot;
  return nextAiShot;
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
  strategy: AiStrategy = nextAiShot,
): FireResult => {
  const playerShot = resolveShot(aiBoard, playerShots, cell);
  const updatedPlayerShots = [...playerShots, playerShot];

  if (isFleetSunk(updatedPlayerShots)) {
    return {playerShot, aiShot: null, phase: 'player-won'};
  }

  const aiCell = strategy(aiShots);
  const aiShot = resolveShot(playerBoard, aiShots, aiCell);
  const updatedAiShots = [...aiShots, aiShot];

  if (isFleetSunk(updatedAiShots)) {
    return {playerShot, aiShot, phase: 'computer-won'};
  }

  return {playerShot, aiShot, phase: 'player-turn'};
};
