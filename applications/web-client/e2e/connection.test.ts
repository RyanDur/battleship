import {test, expect} from '@playwright/test';

test('two peers complete the full offer/answer connection flow', async ({browser}) => {
  test.setTimeout(90_000);
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();

  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible({timeout: 10_000});
  await expect(bob.getByText('Service online')).toBeVisible({timeout: 10_000});

  // Alice generates an offer code
  await alice.getByRole('button', {name: 'Create'}).click();
  await alice.getByLabel('Passphrase').fill('secret');
  await alice.getByRole('button', {name: 'Generate code'}).click();

  await expect(alice.locator('code')).toBeVisible({timeout: 30_000});
  const offerCode = await alice.locator('code').textContent();

  // Bob joins with the offer code
  await bob.getByRole('button', {name: 'Join'}).click();
  await bob.getByLabel('Passphrase').fill('secret');
  await bob.getByLabel('Offer code').fill(offerCode!);
  await bob.getByRole('button', {name: 'Join'}).click();

  await expect(bob.locator('code')).toBeVisible({timeout: 30_000});
  const responseCode = await bob.locator('code').textContent();

  // Alice accepts the response code
  await alice.getByLabel('Response code').fill(responseCode!);
  await expect(alice.getByLabel('Response code')).toHaveValue(responseCode!);
  await alice.locator('.direct-connect').getByRole('button', {name: 'Accept'}).click();

  // Both see each other as connected (Disconnect button only appears in the connected peers list)
  await expect(alice.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});
  await expect(bob.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});

  await aliceCtx.close();
  await bobCtx.close();
});
