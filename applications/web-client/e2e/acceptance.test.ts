import {test, expect} from '@playwright/test';
import {connectPeers} from './helpers';

test('users see each other as available to connect when both are online', async ({browser}) => {
  test.setTimeout(30_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).
  await expect(bob.getByText('Service online')).

  await expect(alice.getByRole('list', {name: 'Online peers'}).getByRole('button', {name: 'Connect'}).first()).
  await expect(bob.getByRole('list', {name: 'Online peers'}).getByRole('button', {name: 'Connect'}).first()).

  await aliceCtx.close();
  await bobCtx.close();
});

test('unread message count appears on Comms when a message arrives and chat is closed', async ({browser}) => {
  test.setTimeout(90_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).
  await expect(bob.getByText('Service online')).

  await connectPeers(alice, bob);

  // Alice opens Bob's chat thread by clicking his name in Fleet
  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Player'}).click();

  // Alice collapses the Comms panel
  await alice.locator('.comms-details > summary').click();

  // Bob opens Alice's thread and sends a message
  await bob.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Player'}).click();
  await bob.getByLabel('Message', {exact: true}).fill('Hello Alice!');
  await bob.getByRole('button', {name: 'Send'}).click();

  // Alice sees the unread badge on the collapsed Comms summary
  await expect(alice.locator('.comms-unread')).toHaveText('1', {timeout: 10_000});

  await aliceCtx.close();
  await bobCtx.close();
});

test('Fleet reflects immediately when a connected peer disconnects', async ({browser}) => {
  test.setTimeout(90_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).
  await expect(bob.getByText('Service online')).

  await connectPeers(alice, bob);

  await expect(alice.getByRole('list', {name: 'Connected peers'})).toBeVisible();
  await expect(bob.getByRole('list', {name: 'Connected peers'})).toBeVisible();

  // Bob disconnects
  await bob.getByRole('button', {name: 'Disconnect'}).click();

  // Alice's Fleet no longer shows any connected peers
  await expect(alice.getByRole('list', {name: 'Connected peers'})).not.

  await aliceCtx.close();
  await bobCtx.close();
});

test('connected peer can introduce two peers and recipient sees an actionable alert', async ({browser}) => {
  test.setTimeout(120_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const charlieCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();
  const charlie = await charlieCtx.newPage();

  // Sequential gotos ensure deterministic Online peers ordering: alice first, bob second, charlie third
  await alice.goto('/battleship/');
  await bob.goto('/battleship/');
  await charlie.goto('/battleship/');

  await expect(alice.getByText('Service online')).
  await expect(bob.getByText('Service online')).
  await expect(charlie.getByText('Service online')).

  // Alice connects to Bob via manual P2P
  await connectPeers(alice, bob);

  // Alice connects to Charlie via manual P2P (avoids fragile Online peers list ordering under parallel workers)
  await connectPeers(alice, charlie);

  // Both connections are active: alice↔bob and alice↔charlie
  await expect(alice.getByRole('button', {name: 'Disconnect'})).toHaveCount(2);

  // Bob and Charlie each trust Alice so she can introduce them
  await bob.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Trust'}).click();
  await charlie.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Trust'}).click();

  // Alice sees both trust indicators appear in her Fleet
  await expect(alice.locator('.fleet-peer-trust')).toHaveCount(2);

  // Alice introduces her first trusted peer to the other
  await alice.getByRole('button', {name: 'Introduce'}).first().click();
  await alice.getByRole('button', {name: /introduce to/i}).click();

  // Charlie receives the introduction alert with Accept and Decline actions
  await expect(charlie.locator('[aria-label="Alerts"]').getByText(/wants to introduce/i)).
  await expect(charlie.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'})).toBeVisible();
  await expect(charlie.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Decline'})).toBeVisible();

  await aliceCtx.close();
  await bobCtx.close();
  await charlieCtx.close();
});
