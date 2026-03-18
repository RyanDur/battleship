import {test, expect} from '@playwright/test';
import type {Page} from '@playwright/test';

const connectPeers = async (alice: Page, bob: Page) => {
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
  await alice.getByRole('button', {name: 'Accept'}).click();

  await expect(alice.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});
  await expect(bob.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});
};

test('connected peers can send and receive chat messages', async ({browser}) => {
  test.setTimeout(90_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible({timeout: 10_000});
  await expect(bob.getByText('Service online')).toBeVisible({timeout: 10_000});

  await connectPeers(alice, bob);

  // Alice sends a message
  await alice.getByLabel('Message', {exact: true}).fill('Hello Bob!');
  await alice.getByRole('button', {name: 'Send'}).click();

  // Both peers see Alice's message
  await expect(alice.getByText('Hello Bob!')).toBeVisible({timeout: 5_000});
  await expect(bob.getByText('Hello Bob!')).toBeVisible({timeout: 5_000});

  // Bob replies
  await bob.getByLabel('Message', {exact: true}).fill('Hello Alice!');
  await bob.getByRole('button', {name: 'Send'}).click();

  // Both peers see Bob's reply
  await expect(bob.getByText('Hello Alice!')).toBeVisible({timeout: 5_000});
  await expect(alice.getByText('Hello Alice!')).toBeVisible({timeout: 5_000});

  await aliceCtx.close();
  await bobCtx.close();
});
