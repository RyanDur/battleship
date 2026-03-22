import {test, expect} from '@playwright/test';
import {placeAllShips} from './helpers';

test('player places all ships on the board and confirms placement', async ({page}) => {
  await page.goto('/battleship/');

  await expect(page.getByRole('region', {name: /place your ships/i})).toBeVisible();

  await placeAllShips(page);

  await expect(page.getByRole('button', {name: /confirm placement/i})).toBeVisible();
  await page.getByRole('button', {name: /confirm placement/i}).click();

  await expect(page.getByRole('region', {name: /place your ships/i})).not.toBeVisible();
});

test('confirmed placement persists after page reload', async ({page}) => {
  await page.goto('/battleship/');

  await expect(page.getByRole('region', {name: /place your ships/i})).toBeVisible();

  await placeAllShips(page);
  await page.getByRole('button', {name: /confirm placement/i}).click();
  await expect(page.getByRole('region', {name: /place your ships/i})).not.toBeVisible();

  await page.reload();

  await expect(page.getByRole('region', {name: /place your ships/i})).not.toBeVisible();
});