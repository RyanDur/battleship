import type {Page} from '@playwright/test';
import {expect} from '@playwright/test';

export const placeAllShips = async (page: Page) => {
  await page.getByRole('button', {name: /^carrier/i}).click();
  await page.getByRole('button', {name: 'Row 1, Column 1', exact: true}).click();
  await page.getByRole('button', {name: /^battleship/i}).click();
  await page.getByRole('button', {name: 'Row 2, Column 1', exact: true}).click();
  await page.getByRole('button', {name: /^cruiser/i}).click();
  await page.getByRole('button', {name: 'Row 3, Column 1', exact: true}).click();
  await page.getByRole('button', {name: /^submarine/i}).click();
  await page.getByRole('button', {name: 'Row 4, Column 1', exact: true}).click();
  await page.getByRole('button', {name: /^destroyer/i}).click();
  await page.getByRole('button', {name: 'Row 5, Column 1', exact: true}).click();
};

// Ships placed by placeAllShips (horizontal from column 1):
// Carrier (5):    Row 1, Cols 1-5
// Battleship (4): Row 2, Cols 1-4
// Cruiser (3):    Row 3, Cols 1-3
// Submarine (3):  Row 4, Cols 1-3
// Destroyer (2):  Row 5, Cols 1-2
const FLEET_CELLS = [
  ...Array.from({length: 5}, (_, i) => ({row: 1, col: i + 1})),
  ...Array.from({length: 4}, (_, i) => ({row: 2, col: i + 1})),
  ...Array.from({length: 3}, (_, i) => ({row: 3, col: i + 1})),
  ...Array.from({length: 3}, (_, i) => ({row: 4, col: i + 1})),
  ...Array.from({length: 2}, (_, i) => ({row: 5, col: i + 1})),
];

export const sinkFleet = async (attacker: Page, defender: Page) => {
  let missIndex = 0;
  for (const {row, col} of FLEET_CELLS) {
    await attacker.getByRole('region', {name: /tracking board/i})
      .getByRole('button', {name: `Row ${row}, Column ${col}`, exact: true}).click();
    // React may batch OPPONENT_FIRED + P2P_GAME_OVER into one render, skipping the
    // "Your turn" intermediate state. Poll both pages since .or() requires same frame.
    await expect(async () => {
      const defenderTurn = await defender.locator('.game-announcement').filter({hasText: /your turn/i}).isVisible();
      const gameOver = await attacker.locator('.game-over').isVisible();
      expect(defenderTurn || gameOver).toBe(true);
    }).toPass({timeout: 10_000});
    if (await attacker.locator('.game-over').isVisible()) break;
    // Defender fires a miss using a unique cell (rows 6-10 are never fleet cells)
    const missRow = 10 - Math.floor(missIndex / 10);
    const missCol = (missIndex % 10) + 1;
    missIndex++;
    await defender.getByRole('region', {name: /tracking board/i})
      .getByRole('button', {name: `Row ${missRow}, Column ${missCol}`, exact: true}).click();
    await expect(attacker.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 10_000});
  }
};

export const connectPeers = async (alice: Page, bob: Page) => {
  await alice.getByRole('button', {name: 'Create'}).click();
  await alice.getByLabel('Passphrase').fill('secret');
  await alice.getByRole('button', {name: 'Generate code'}).click();
  await expect(alice.locator('code')).toBeVisible({timeout: 30_000});
  const offerCode = await alice.locator('code').textContent();

  await bob.getByRole('button', {name: 'Join'}).click();
  await bob.getByLabel('Passphrase').fill('secret');
  await bob.getByLabel('Offer code').fill(offerCode!);
  await bob.getByRole('button', {name: 'Join'}).click();
  await expect(bob.locator('code')).toBeVisible({timeout: 30_000});
  const responseCode = await bob.locator('code').textContent();

  await alice.getByLabel('Response code').fill(responseCode!);
  await expect(alice.getByLabel('Response code')).toHaveValue(responseCode!);
  await alice.locator('.direct-connect').getByRole('button', {name: 'Accept'}).click();

  await expect(alice.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});
  await expect(bob.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});
};
