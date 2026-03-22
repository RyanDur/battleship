import {test, expect} from '@playwright/test';
import type {Page} from '@playwright/test';

const placeAllShips = async (page: Page) => {
  await page.getByRole('button', {name: /^carrier/i}).click();
  await page.getByRole('button', {name: 'Row 1, Column 1'}).click();
  await page.getByRole('button', {name: /^battleship/i}).click();
  await page.getByRole('button', {name: 'Row 2, Column 1'}).click();
  await page.getByRole('button', {name: /^cruiser/i}).click();
  await page.getByRole('button', {name: 'Row 3, Column 1'}).click();
  await page.getByRole('button', {name: /^submarine/i}).click();
  await page.getByRole('button', {name: 'Row 4, Column 1'}).click();
  await page.getByRole('button', {name: /^destroyer/i}).click();
  await page.getByRole('button', {name: 'Row 5, Column 1'}).click();
};

test('player places all ships on the board and confirms placement', async ({page}) => {
  await page.goto('/battleship/');

  await expect(page.getByRole('region', {name: /place your ships/i})).toBeVisible();

  await placeAllShips(page);

  await expect(page.getByRole('button', {name: /confirm placement/i})).toBeVisible();
  await page.getByRole('button', {name: /confirm placement/i}).click();

  await expect(page.getByRole('region', {name: /place your ships/i})).not.toBeVisible({timeout: 5_000});
});

test('confirmed placement persists after page reload', async ({page}) => {
  await page.goto('/battleship/');

  await expect(page.getByRole('region', {name: /place your ships/i})).toBeVisible();

  await placeAllShips(page);
  await page.getByRole('button', {name: /confirm placement/i}).click();
  await expect(page.getByRole('region', {name: /place your ships/i})).not.toBeVisible({timeout: 5_000});

  await page.reload();

  await expect(page.getByRole('region', {name: /place your ships/i})).not.toBeVisible();
});