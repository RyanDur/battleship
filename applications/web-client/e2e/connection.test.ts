import {test, expect} from '@playwright/test';
import {connectPeers} from './helpers';

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
