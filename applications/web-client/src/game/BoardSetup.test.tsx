import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {BoardSetup} from './BoardSetup';
import {type Board} from './board';

const setup = (onConfirm = () => {}) => {
  render(<BoardSetup onConfirm={onConfirm}/>);
};

const placeAll = async (user: ReturnType<typeof userEvent.setup>) => {
  const positions = [
    {ship: 'Carrier', row: 1, col: 1},
    {ship: 'Battleship', row: 2, col: 1},
    {ship: 'Cruiser', row: 3, col: 1},
    {ship: 'Submarine', row: 4, col: 1},
    {ship: 'Destroyer', row: 5, col: 1},
  ];
  for (const {ship, row, col} of positions) {
    await user.click(screen.getByRole('button', {name: new RegExp(`^${ship}`, 'i')}));
    await user.click(screen.getByRole('button', {name: `Row ${row}, Column ${col}`}));
  }
};

describe('BoardSetup', () => {
  it('shows a 10x10 placement grid', () => {
    setup();
    const board = screen.getByRole('region', {name: /place your ships/i});
    expect(board).toBeInTheDocument();
    expect(within(board).getAllByRole('button', {name: /^row/i})).toHaveLength(100);
  });

  it('shows all 5 ships as buttons in the remaining list', () => {
    setup();
    const list = screen.getByRole('list', {name: /ships remaining/i});
    expect(within(list).getByRole('button', {name: /^carrier/i})).toBeInTheDocument();
    expect(within(list).getByRole('button', {name: /^battleship/i})).toBeInTheDocument();
    expect(within(list).getByRole('button', {name: /^cruiser/i})).toBeInTheDocument();
    expect(within(list).getByRole('button', {name: /^submarine/i})).toBeInTheDocument();
    expect(within(list).getByRole('button', {name: /^destroyer/i})).toBeInTheDocument();
  });

  it('does not show confirm button before all ships are placed', () => {
    setup();
    expect(screen.queryByRole('button', {name: /confirm placement/i})).not.toBeInTheDocument();
  });

  describe('selecting a ship', () => {
    it('marks the selected ship button as pressed', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole('button', {name: /^carrier/i}));
      expect(screen.getByRole('button', {name: /^carrier/i})).toHaveAttribute('aria-pressed', 'true');
    });

    it('only one ship is selected at a time', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole('button', {name: /^carrier/i}));
      await user.click(screen.getByRole('button', {name: /^battleship/i}));
      expect(screen.getByRole('button', {name: /^carrier/i})).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', {name: /^battleship/i})).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('placing a ship', () => {
    it('places the selected ship on the grid when a cell is clicked', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole('button', {name: /^carrier/i}));
      await user.click(screen.getByRole('button', {name: 'Row 1, Column 1'}));
      expect(screen.queryByRole('button', {name: /^carrier/i})).not.toBeInTheDocument();
    });

    it('does not place a ship when no ship is selected', async () => {
      const user = userEvent.setup();
      setup();
      // Don't click any ship - just click a cell
      await user.click(screen.getByRole('button', {name: 'Row 1, Column 1'}));
      // All 5 ships still in the remaining list
      expect(screen.getAllByRole('button', {name: /^(carrier|battleship|cruiser|submarine|destroyer)/i})).toHaveLength(5);
    });

    it('does not place a ship in an out-of-bounds position', async () => {
      const user = userEvent.setup();
      setup();
      // Carrier (size 5) placed horizontally at col 7 would go out of bounds (cols 7-11)
      await user.click(screen.getByRole('button', {name: /^carrier/i}));
      await user.click(screen.getByRole('button', {name: 'Row 1, Column 7'}));
      // Carrier still in remaining list
      expect(screen.getByRole('button', {name: /^carrier/i})).toBeInTheDocument();
    });

    it('does not place a ship on an occupied cell', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole('button', {name: /^carrier/i}));
      await user.click(screen.getByRole('button', {name: 'Row 1, Column 1'}));
      // Battleship overlaps Carrier at row 1
      await user.click(screen.getByRole('button', {name: /^battleship/i}));
      await user.click(screen.getByRole('button', {name: 'Row 1, Column 3'}));
      expect(screen.getByRole('button', {name: /^battleship/i})).toBeInTheDocument();
    });
  });

  describe('rotation', () => {
    it('shows a Rotate button', () => {
      setup();
      expect(screen.getByRole('button', {name: /rotate/i})).toBeInTheDocument();
    });

    it('clicking Rotate changes orientation so a vertical ship fits differently', async () => {
      const user = userEvent.setup();
      setup();
      // With horizontal orientation, Carrier (size 5) at col 7 is invalid
      // After rotating to vertical, col 7 row 1 should be valid (rows 1-5, col 7)
      await user.click(screen.getByRole('button', {name: /rotate/i}));
      await user.click(screen.getByRole('button', {name: /^carrier/i}));
      await user.click(screen.getByRole('button', {name: 'Row 1, Column 7'}));
      expect(screen.queryByRole('button', {name: /^carrier/i})).not.toBeInTheDocument();
    });
  });

  describe('confirm placement', () => {
    it('shows the confirm button only when all 5 ships are placed', async () => {
      const user = userEvent.setup();
      setup();
      await placeAll(user);
      expect(screen.getByRole('button', {name: /confirm placement/i})).toBeInTheDocument();
    });

    it('calls onConfirm with the completed board when confirm is clicked', async () => {
      const user = userEvent.setup();
      let confirmed: Board | null = null;
      render(<BoardSetup onConfirm={(board) => { confirmed = board; }}/>);
      await placeAll(user);
      await user.click(screen.getByRole('button', {name: /confirm placement/i}));
      expect(confirmed).not.toBeNull();
      expect(confirmed!.placed).toHaveLength(5);
    });

  });
});
