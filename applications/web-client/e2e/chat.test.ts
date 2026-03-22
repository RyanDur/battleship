import {test, expect} from '@playwright/test';
import {connectPeers} from './helpers';

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

  // Select the connected peer in Fleet to open chat in Comms
  await expect(alice.getByRole('region', {name: /connected/i}).getByRole('button', {name: 'Player'})).toBeVisible({timeout: 10_000});
  await expect(bob.getByRole('region', {name: /connected/i}).getByRole('button', {name: 'Player'})).toBeVisible({timeout: 10_000});
  await alice.getByRole('region', {name: /connected/i}).getByRole('button', {name: 'Player'}).click();
  await bob.getByRole('region', {name: /connected/i}).getByRole('button', {name: 'Player'}).click();

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
