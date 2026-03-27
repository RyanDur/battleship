import {test, expect} from '@playwright/test';
import {placeAllShips} from './helpers';

test('player can play a complete game against the computer without a server', async ({page}) => {
  test.setTimeout(120_000);

  await page.goto('/battleship/');

  // Board setup is visible immediately — no server required
  await expect(page.getByRole('region', {name: /place your ships/i})).toBeVisible({timeout: 5_000});

  await placeAllShips(page);
  await page.getByRole('button', {name: /confirm placement/i}).click();

  // After confirming board, the Play vs AI button is visible without a server
  await expect(page.getByRole('button', {name: /play vs ai/i})).toBeVisible({timeout: 5_000});

  await page.getByRole('button', {name: /play vs ai/i}).click();

  // Game starts — player's turn
  await expect(page.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 5_000});

  // Player fires a shot
  await page.getByRole('region', {name: /tracking board/i})
    .getByRole('button', {name: 'Row 1, Column 1', exact: true}).click();

  // Shot result appears (miss or hit)
  await expect(page.getByRole('region', {name: /tracking board/i}))
    .toContainText(/miss|hit|sunk/i, {timeout: 5_000});

  // After player fires, either it's player's turn again or computer's turn shows
  await expect(page.locator('.game-announcement')).toContainText(/your turn|computer/i, {timeout: 5_000});
});

test('player sees Play vs AI button without Service online', async ({page}) => {
  test.setTimeout(30_000);

  await page.goto('/battleship/');

  await placeAllShips(page);
  await page.getByRole('button', {name: /confirm placement/i}).click();

  // Play vs AI is visible even when service is offline
  await expect(page.getByRole('button', {name: /play vs ai/i})).toBeVisible({timeout: 5_000});
});

test('player can sink the AI fleet and win', async ({page}) => {
  test.setTimeout(120_000);

  await page.goto('/battleship/');

  await expect(page.getByRole('region', {name: /place your ships/i})).toBeVisible({timeout: 5_000});

  await placeAllShips(page);
  await page.getByRole('button', {name: /confirm placement/i}).click();

  await expect(page.getByRole('button', {name: /play vs ai/i})).toBeVisible({timeout: 5_000});
  await page.getByRole('button', {name: /play vs ai/i}).click();

  await expect(page.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 5_000});

  // Fire all 100 cells — guaranteed to sink the AI fleet
  const trackingBoard = page.getByRole('region', {name: /tracking board/i});

  for (let row = 1; row <= 10; row++) {
    for (let col = 1; col <= 10; col++) {
      const gameOver = await page.locator('.game-over').isVisible();
      if (gameOver) break;

      const btn = trackingBoard.getByRole('button', {name: `Row ${row}, Column ${col}`, exact: true});
      const isDisabled = await btn.isDisabled();
      if (isDisabled) continue;

      await btn.click();
      // Wait for shot to resolve: button becomes disabled (shot registered) or game ends
      await expect(async () => {
        const over = await page.locator('.game-over').isVisible();
        const fired = await btn.isDisabled();
        expect(over || fired).toBe(true);
      }).toPass({timeout: 10_000});
    }

    const gameOver = await page.locator('.game-over').isVisible();
    if (gameOver) break;
  }

  // Eventually the game ends
  await expect(page.locator('.game-over')).toBeVisible({timeout: 10_000});
  await expect(page.getByRole('button', {name: /new game/i})).toBeVisible();
});
