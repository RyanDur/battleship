import {test, expect} from '@playwright/test';
import {connectPeers} from './helpers';

test('player can copy a connection code with a single click and sees feedback', async ({browser}) => {
  test.setTimeout(60_000);

  const aliceCtx = await browser.newContext({permissions: ['clipboard-read', 'clipboard-write']});
  const alice = await aliceCtx.newPage();

  await alice.goto('/battleship/');
  await expect(alice.getByText('Service online')).toBeVisible();

  await alice.getByRole('button', {name: 'Create'}).click();
  await alice.getByLabel('Passphrase').fill('secret');
  await alice.getByRole('button', {name: 'Generate code'}).click();

  await expect(alice.locator('code')).toBeVisible({timeout: 30_000});
  const offerCode = await alice.locator('code').textContent();

  await expect(alice.getByRole('button', {name: 'Copy'})).toBeVisible();
  await alice.getByRole('button', {name: 'Copy'}).click();

  await expect(alice.getByText('Copied!')).toBeVisible();

  const clipboardText = await alice.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(offerCode);

  await aliceCtx.close();
});

test('two peers complete the full offer/answer connection flow', async ({browser}) => {
  test.setTimeout(90_000);
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();

  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  await connectPeers(alice, bob);

  // Both see each other as connected (Disconnect button only appears in the connected peers list)
  await expect(alice.getByRole('button', {name: 'Disconnect'})).toBeVisible();
  await expect(bob.getByRole('button', {name: 'Disconnect'})).toBeVisible();

  await aliceCtx.close();
  await bobCtx.close();
});
