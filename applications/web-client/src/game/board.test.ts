import {describe, it, expect} from 'vitest';
import {
  SHIPS,
  canPlace,
  placeShip,
  remainingShips,
  isComplete,
  isCellOccupied,
  occupiedCells,
  type Board,
} from './board';

const emptyBoard: Board = {placed: []};

describe('SHIPS', () => {
  it('contains the 5 standard ships', () => {
    expect(SHIPS.map(s => s.name)).toEqual([
      'Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer',
    ]);
  });

  it('has correct sizes', () => {
    expect(SHIPS.map(s => s.size)).toEqual([5, 4, 3, 3, 2]);
  });
});

describe('occupiedCells', () => {
  it('returns cells for a horizontal ship', () => {
    const carrier = SHIPS[0];
    const cells = occupiedCells({ship: carrier, position: {row: 1, col: 1}, orientation: 'horizontal'});
    expect(cells).toEqual([
      {row: 1, col: 1},
      {row: 1, col: 2},
      {row: 1, col: 3},
      {row: 1, col: 4},
      {row: 1, col: 5},
    ]);
  });

  it('returns cells for a vertical ship', () => {
    const destroyer = SHIPS[4];
    const cells = occupiedCells({ship: destroyer, position: {row: 3, col: 5}, orientation: 'vertical'});
    expect(cells).toEqual([
      {row: 3, col: 5},
      {row: 4, col: 5},
    ]);
  });
});

describe('canPlace', () => {
  it('allows placing a ship on an empty board within bounds', () => {
    const carrier = SHIPS[0];
    expect(canPlace(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal')).toBe(true);
  });

  it('prevents placing a horizontal ship that goes out of bounds on the right', () => {
    const carrier = SHIPS[0]; // size 5
    expect(canPlace(emptyBoard, carrier, {row: 1, col: 7}, 'horizontal')).toBe(false);
  });

  it('prevents placing a vertical ship that goes out of bounds at the bottom', () => {
    const carrier = SHIPS[0]; // size 5
    expect(canPlace(emptyBoard, carrier, {row: 8, col: 1}, 'vertical')).toBe(false);
  });

  it('prevents placing a ship starting out of bounds', () => {
    const destroyer = SHIPS[4];
    expect(canPlace(emptyBoard, destroyer, {row: 0, col: 1}, 'horizontal')).toBe(false);
    expect(canPlace(emptyBoard, destroyer, {row: 1, col: 0}, 'horizontal')).toBe(false);
    expect(canPlace(emptyBoard, destroyer, {row: 11, col: 1}, 'horizontal')).toBe(false);
  });

  it('prevents placing a ship overlapping an existing ship', () => {
    const carrier = SHIPS[0];
    const battleship = SHIPS[1];
    const board = placeShip(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal')!;
    expect(canPlace(board, battleship, {row: 1, col: 3}, 'horizontal')).toBe(false);
  });

  it('allows placing a ship adjacent to (not overlapping) an existing ship', () => {
    const carrier = SHIPS[0];
    const battleship = SHIPS[1];
    const board = placeShip(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal')!;
    expect(canPlace(board, battleship, {row: 2, col: 1}, 'horizontal')).toBe(true);
  });

  it('allows placing a vertical ship that exactly fits at the bottom', () => {
    const carrier = SHIPS[0]; // size 5
    expect(canPlace(emptyBoard, carrier, {row: 6, col: 1}, 'vertical')).toBe(true);
  });
});

describe('placeShip', () => {
  it('returns a new board with the ship added', () => {
    const carrier = SHIPS[0];
    const board = placeShip(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal');
    expect(board).not.toBeNull();
    expect(board!.placed).toHaveLength(1);
    expect(board!.placed[0].ship).toBe(carrier);
  });

  it('returns null for an invalid placement', () => {
    const carrier = SHIPS[0];
    const board = placeShip(emptyBoard, carrier, {row: 1, col: 7}, 'horizontal');
    expect(board).toBeNull();
  });

  it('does not mutate the original board', () => {
    const carrier = SHIPS[0];
    placeShip(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal');
    expect(emptyBoard.placed).toHaveLength(0);
  });
});

describe('remainingShips', () => {
  it('returns all 5 ships for an empty board', () => {
    expect(remainingShips(emptyBoard)).toHaveLength(5);
  });

  it('excludes placed ships', () => {
    const carrier = SHIPS[0];
    const board = placeShip(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal')!;
    const remaining = remainingShips(board);
    expect(remaining).toHaveLength(4);
    expect(remaining.map(s => s.name)).not.toContain('Carrier');
  });
});

describe('isComplete', () => {
  it('returns false for an empty board', () => {
    expect(isComplete(emptyBoard)).toBe(false);
  });

  it('returns false when only some ships are placed', () => {
    const carrier = SHIPS[0];
    const board = placeShip(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal')!;
    expect(isComplete(board)).toBe(false);
  });

  it('returns true when all 5 ships are placed', () => {
    let board: Board = emptyBoard;
    board = placeShip(board, SHIPS[0], {row: 1, col: 1}, 'horizontal')!;
    board = placeShip(board, SHIPS[1], {row: 2, col: 1}, 'horizontal')!;
    board = placeShip(board, SHIPS[2], {row: 3, col: 1}, 'horizontal')!;
    board = placeShip(board, SHIPS[3], {row: 4, col: 1}, 'horizontal')!;
    board = placeShip(board, SHIPS[4], {row: 5, col: 1}, 'horizontal')!;
    expect(isComplete(board)).toBe(true);
  });
});


describe('isCellOccupied', () => {
  it('returns false for a cell on an empty board', () => {
    expect(isCellOccupied(emptyBoard, {row: 1, col: 1})).toBe(false);
  });

  it('returns true for a cell occupied by a ship', () => {
    const carrier = SHIPS[0];
    const board = placeShip(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal')!;
    expect(isCellOccupied(board, {row: 1, col: 3})).toBe(true);
  });

  it('returns false for a cell not occupied by any ship', () => {
    const carrier = SHIPS[0];
    const board = placeShip(emptyBoard, carrier, {row: 1, col: 1}, 'horizontal')!;
    expect(isCellOccupied(board, {row: 2, col: 1})).toBe(false);
  });
});