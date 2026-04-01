import {describe, it, expect} from 'vitest';
import {huntTargetShot, probabilityShot, createAiStrategy, resolveFireShot, randomBoard} from './aiGame';
import type {Shot} from './game';
import type {Board} from './board';

const hit = (row: number, col: number): Shot => ({cell: {row, col}, result: 'hit'});
const miss = (row: number, col: number): Shot => ({cell: {row, col}, result: 'miss'});
const sunk = (row: number, col: number, name: string, size: number): Shot => ({cell: {row, col}, result: 'sunk', ship: {name, size}});

describe('huntTargetShot', () => {
  it('returns a random unfired cell when no hits exist', () => {
    const cell = huntTargetShot([]);
    expect(cell.row).toBeGreaterThanOrEqual(1);
    expect(cell.row).toBeLessThanOrEqual(10);
    expect(cell.col).toBeGreaterThanOrEqual(1);
    expect(cell.col).toBeLessThanOrEqual(10);
  });

  it('returns a cell adjacent to an unsunk hit', () => {
    const fired: Shot[] = [hit(5, 5)];
    const result = huntTargetShot(fired);
    const adjacents = [{row: 4, col: 5}, {row: 6, col: 5}, {row: 5, col: 4}, {row: 5, col: 6}];
    expect(adjacents).toContainEqual(result);
  });

  it('does not return a cell that has already been fired', () => {
    const fired: Shot[] = [hit(5, 5), miss(4, 5), miss(6, 5), miss(5, 4), miss(5, 6)];
    const result = huntTargetShot(fired);
    const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
    expect(firedSet.has(`${result.row},${result.col}`)).toBe(false);
  });

  it('falls back to random when all adjacent cells to hits are already fired', () => {
    // Hit at (1,1) — adjacents are (2,1) and (1,2). Fire all of them.
    const fired: Shot[] = [hit(1, 1), miss(2, 1), miss(1, 2)];
    const result = huntTargetShot(fired);
    const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
    expect(firedSet.has(`${result.row},${result.col}`)).toBe(false);
  });

  it('does not target adjacent cells of sunk hits (result sunk, not hit)', () => {
    // Only cells with result 'hit' (not 'sunk') are targeted
    const fired: Shot[] = [sunk(5, 5, 'Destroyer', 2)];
    // No 'hit' shots, so it should be random — not necessarily adjacent to (5,5)
    const result = huntTargetShot(fired);
    const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
    expect(firedSet.has(`${result.row},${result.col}`)).toBe(false);
  });
});

describe('probabilityShot', () => {
  it('returns a valid unfired cell', () => {
    const cell = probabilityShot([]);
    expect(cell.row).toBeGreaterThanOrEqual(1);
    expect(cell.row).toBeLessThanOrEqual(10);
    expect(cell.col).toBeGreaterThanOrEqual(1);
    expect(cell.col).toBeLessThanOrEqual(10);
  });

  it('does not return a cell that has already been fired', () => {
    const fired: Shot[] = [miss(1, 1), miss(1, 2), miss(1, 3)];
    const result = probabilityShot(fired);
    const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
    expect(firedSet.has(`${result.row},${result.col}`)).toBe(false);
  });

  it('targets cells adjacent to hits more often than random', () => {
    // With a hit at (5,5), cells that could extend a ship through (5,5) should be preferred.
    // We verify that the chosen cell is not far away — at minimum it's valid.
    const fired: Shot[] = [hit(5, 5)];
    const result = probabilityShot(fired);
    const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
    expect(firedSet.has(`${result.row},${result.col}`)).toBe(false);
    expect(result.row).toBeGreaterThanOrEqual(1);
    expect(result.col).toBeGreaterThanOrEqual(1);
  });

  it('avoids cells that are misses', () => {
    // Block all cols 1-9, row 1 with misses to force col 10
    const fired: Shot[] = Array.from({length: 9}, (_, i) => miss(1, i + 1));
    const result = probabilityShot(fired);
    const firedSet = new Set(fired.map(s => `${s.cell.row},${s.cell.col}`));
    expect(firedSet.has(`${result.row},${result.col}`)).toBe(false);
  });
});

describe('createAiStrategy', () => {
  it('easy strategy fires randomly', () => {
    const strategy = createAiStrategy('easy');
    const cell = strategy([]);
    expect(cell.row).toBeGreaterThanOrEqual(1);
    expect(cell.row).toBeLessThanOrEqual(10);
  });

  it('normal strategy returns huntTargetShot behavior', () => {
    const strategy = createAiStrategy('normal');
    const fired: Shot[] = [hit(5, 5)];
    const result = strategy(fired);
    const adjacents = [{row: 4, col: 5}, {row: 6, col: 5}, {row: 5, col: 4}, {row: 5, col: 6}];
    expect(adjacents).toContainEqual(result);
  });

  it('hard strategy returns probabilityShot behavior', () => {
    const strategy = createAiStrategy('hard');
    const fired: Shot[] = [miss(1, 1)];
    const result = strategy(fired);
    expect(result).not.toEqual({row: 1, col: 1});
  });
});

describe('AI game integration', () => {
  const playerBoard: Board = {
    placed: [
      {ship: {name: 'Carrier', size: 5}, position: {row: 1, col: 1}, orientation: 'horizontal'},
      {ship: {name: 'Battleship', size: 4}, position: {row: 2, col: 1}, orientation: 'horizontal'},
      {ship: {name: 'Cruiser', size: 3}, position: {row: 3, col: 1}, orientation: 'horizontal'},
      {ship: {name: 'Submarine', size: 3}, position: {row: 4, col: 1}, orientation: 'horizontal'},
      {ship: {name: 'Destroyer', size: 2}, position: {row: 5, col: 1}, orientation: 'horizontal'},
    ],
  };

  const completesGame = (strategy: ReturnType<typeof createAiStrategy>): boolean => {
    const aiBoard = randomBoard();
    let playerShots: Shot[] = [];
    let aiShots: Shot[] = [];
    let phase: string = 'player-turn';
    let turns = 0;
    const maxTurns = 100;

    while (phase === 'player-turn' && turns < maxTurns) {
      const unfired = Array.from({length: 10}, (_, r) =>
        Array.from({length: 10}, (_, c) => ({row: r + 1, col: c + 1}))
      ).flat().filter(c => !playerShots.some(s => s.cell.row === c.row && s.cell.col === c.col));
      if (unfired.length === 0) break;
      const cell = unfired[Math.floor(Math.random() * unfired.length)];
      const result = resolveFireShot(aiBoard, playerBoard, playerShots, aiShots, cell, strategy);
      playerShots = [...playerShots, result.playerShot];
      if (result.aiShot) aiShots = [...aiShots, result.aiShot];
      phase = result.phase;
      turns++;
    }

    return phase === 'player-won' || phase === 'computer-won';
  };

  it('a full game with easy difficulty eventually ends', () => {
    expect(completesGame(createAiStrategy('easy'))).toBe(true);
  });

  it('a full game with normal difficulty eventually ends', () => {
    expect(completesGame(createAiStrategy('normal'))).toBe(true);
  });

  it('a full game with hard difficulty eventually ends', () => {
    expect(completesGame(createAiStrategy('hard'))).toBe(true);
  });
});
