import {test, expect} from '@playwright/test';
import {connectPeers, placeAllShips} from './helpers';

test('two connected peers can play a complete P2P game of Battleship', async ({browser}) => {
  test.setTimeout(120_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  // Both players place ships first so the lobby shows "Use This Board"
  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();
  await placeAllShips(bob);
  await bob.getByRole('button', {name: /confirm placement/i}).click();

  await connectPeers(alice, bob);

  // Alice challenges Bob using the Challenge button in Connected peers
  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();

  // Bob receives a challenge alert
  await expect(bob.locator('[aria-label="Alerts"]').getByText(/wants to play/i)).toBeVisible({timeout: 10_000});
  await expect(bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'})).toBeVisible();
  await expect(bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Decline'})).toBeVisible();

  // Bob accepts
  await bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'}).click();

  // Both see the game lobby
  await expect(alice.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 10_000});
  await expect(bob.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 10_000});

  // Both use their existing boards
  await alice.getByRole('button', {name: /use this board/i}).click();
  await bob.getByRole('button', {name: /use this board/i}).click();

  // Both see the turn selection UI once both boards are committed
  await expect(alice.getByRole('button', {name: /go first/i})).toBeVisible({timeout: 10_000});

  // Alice claims first turn — coin flip determines who actually goes first
  await alice.getByRole('button', {name: /go first/i}).click();

  // Wait for the coin flip to resolve — both peers get a turn assignment
  const aliceStatus = alice.locator('.game-announcement');
  const bobStatus = bob.locator('.game-announcement');
  await expect(aliceStatus).toContainText(/your turn|waiting/i, {timeout: 10_000});
  await expect(bobStatus).toContainText(/your turn|waiting/i, {timeout: 10_000});

  // Determine who goes first based on the coin flip result
  const aliceGoesFirst = /your turn/i.test((await aliceStatus.textContent()) ?? '');
  const [firstPlayer, secondPlayer] = aliceGoesFirst ? [alice, bob] : [bob, alice];

  await expect(firstPlayer.locator('.game-announcement')).toContainText(/your turn/i);
  await expect(secondPlayer.locator('.game-announcement')).toContainText(/waiting/i);

  // The first player fires a shot
  await firstPlayer.getByRole('region', {name: /tracking board/i}).getByRole('button', {name: 'Row 1, Column 1', exact: true}).click();

  // Second player's fleet shows the incoming shot
  await expect(secondPlayer.getByRole('region', {name: /your fleet/i})).toContainText(/miss|hit/i, {timeout: 10_000});

  // Now it is the second player's turn
  await expect(secondPlayer.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 10_000});

  await aliceCtx.close();
  await bobCtx.close();
});

test('challenger sees Waiting status and can cancel a pending challenge', async ({browser}) => {
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

  // Alice challenges Bob
  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();

  // Alice sees Waiting and Cancel buttons
  await expect(alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: /waiting/i})).toBeVisible({timeout: 10_000});
  await expect(alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: /cancel/i})).toBeVisible();

  // Alice cancels
  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: /cancel/i}).click();

  // Challenge button returns
  await expect(alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'})).toBeVisible({timeout: 10_000});

  await aliceCtx.close();
  await bobCtx.close();
});
