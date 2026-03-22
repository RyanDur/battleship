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
