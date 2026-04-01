import {test, expect} from '@playwright/test';
import {connectPeers, placeAllShips, sinkFleet} from './helpers';

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

  // Alice claims first turn directly — she goes first, Bob waits
  await alice.getByRole('button', {name: /go first/i}).click();

  const aliceStatus = alice.locator('.game-announcement');
  const bobStatus = bob.locator('.game-announcement');
  await expect(aliceStatus).toContainText(/your turn/i, {timeout: 10_000});
  await expect(bobStatus).toContainText(/waiting/i, {timeout: 10_000});

  const [firstPlayer, secondPlayer] = [alice, bob];

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

test('player can re-place ships from the game lobby', async ({browser}) => {
  test.setTimeout(90_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  // Alice places ships before the challenge
  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();

  await connectPeers(alice, bob);

  // Alice challenges Bob
  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();
  await bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'}).click();

  // Both see the game lobby
  await expect(alice.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 10_000});

  // Alice sees both "Use this board" and "Re-place ships"
  await expect(alice.getByRole('button', {name: /use this board/i})).toBeVisible();
  await expect(alice.getByRole('button', {name: /re-place ships/i})).toBeVisible();

  // Alice re-places ships
  await alice.getByRole('button', {name: /re-place ships/i}).click();

  // Alice sees the board setup screen
  await expect(alice.getByRole('button', {name: /^carrier/i})).toBeVisible({timeout: 5_000});

  // Alice places new ships and confirms
  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();

  // Alice is back in the lobby
  await expect(alice.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 5_000});
  await expect(alice.getByRole('button', {name: /use this board/i})).toBeVisible();

  await aliceCtx.close();
  await bobCtx.close();
});

test('player with no board sees Place ships in the lobby', async ({browser}) => {
  test.setTimeout(90_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  // Bob has a board, Alice does not
  await placeAllShips(bob);
  await bob.getByRole('button', {name: /confirm placement/i}).click();

  await connectPeers(alice, bob);

  // Bob challenges Alice (who has no board)
  await bob.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();
  await alice.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'}).click();

  // Alice sees the lobby with "Place ships" instead of "Use this board"
  await expect(alice.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 10_000});
  await expect(alice.getByRole('button', {name: /place ships/i})).toBeVisible();
  await expect(alice.getByRole('button', {name: /use this board/i})).not.toBeVisible();

  // Alice places ships from the lobby
  await alice.getByRole('button', {name: /place ships/i}).click();
  await expect(alice.getByRole('button', {name: /^carrier/i})).toBeVisible({timeout: 5_000});
  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();

  // Alice is back in the lobby with "Use this board"
  await expect(alice.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 5_000});
  await expect(alice.getByRole('button', {name: /use this board/i})).toBeVisible();

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

test('player can forfeit a P2P game and opponent sees a forfeit message', async ({browser}) => {
  test.setTimeout(120_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  // Both players place ships and get into a game
  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();
  await placeAllShips(bob);
  await bob.getByRole('button', {name: /confirm placement/i}).click();

  await connectPeers(alice, bob);

  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();
  await bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'}).click();

  await alice.getByRole('button', {name: /use this board/i}).click();
  await bob.getByRole('button', {name: /use this board/i}).click();

  // Wait for turn selection and claim first turn
  await expect(alice.getByRole('button', {name: /go first/i})).toBeVisible({timeout: 10_000});
  await alice.getByRole('button', {name: /go first/i}).click();

  // Wait for the game to start (coin flip resolves)
  await expect(alice.locator('.game-announcement')).toContainText(/your turn|waiting/i, {timeout: 10_000});
  await expect(bob.locator('.game-announcement')).toContainText(/your turn|waiting/i, {timeout: 10_000});

  // Forfeit button is visible during gameplay
  await expect(alice.getByRole('button', {name: /forfeit/i})).toBeVisible();

  // Alice clicks forfeit — sees confirmation step
  await alice.getByRole('button', {name: /^forfeit/i}).click();
  await expect(alice.getByRole('button', {name: /are you sure/i})).toBeVisible();

  // Alice confirms the forfeit
  await alice.getByRole('button', {name: /are you sure/i}).click();

  // Alice sees game over as the loser
  await expect(alice.locator('.game-over')).toBeVisible({timeout: 10_000});

  // Bob sees game over with "[Alice] forfeited. You win!" message
  await expect(bob.locator('.game-over')).toBeVisible({timeout: 10_000});
  await expect(bob.locator('.game-over')).toContainText(/forfeited/i);

  await aliceCtx.close();
  await bobCtx.close();
});

test("winner sees opponent's board revealed and verified at game over", async ({browser}) => {
  test.setTimeout(180_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();
  await placeAllShips(bob);
  await bob.getByRole('button', {name: /confirm placement/i}).click();

  await connectPeers(alice, bob);

  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();
  await bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'}).click();

  await alice.getByRole('button', {name: /use this board/i}).click();
  await bob.getByRole('button', {name: /use this board/i}).click();

  await expect(alice.getByRole('button', {name: /go first/i})).toBeVisible({timeout: 10_000});
  await alice.getByRole('button', {name: /go first/i}).click();

  await expect(alice.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 10_000});
  await expect(bob.locator('.game-announcement')).toContainText(/waiting/i, {timeout: 10_000});

  // Alice sinks all of Bob's ships
  await sinkFleet(alice, bob);

  // Alice (winner) sees game over with Bob's board revealed and verified
  await expect(alice.locator('.game-over')).toBeVisible({timeout: 10_000});
  await expect(alice.getByRole('region', {name: /opponent's fleet/i})).toBeVisible({timeout: 10_000});
  await expect(alice.locator('.game-over')).toContainText(/board verified/i);

  // Bob (loser) sees game over — no board reveal needed on loser's screen
  await expect(bob.locator('.game-over')).toBeVisible({timeout: 10_000});

  await aliceCtx.close();
  await bobCtx.close();
});

test('player can flip a coin for turn order and the result is randomly assigned', async ({browser}) => {
  test.setTimeout(120_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();
  await placeAllShips(bob);
  await bob.getByRole('button', {name: /confirm placement/i}).click();

  await connectPeers(alice, bob);

  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();
  await bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'}).click();

  await alice.getByRole('button', {name: /use this board/i}).click();
  await bob.getByRole('button', {name: /use this board/i}).click();

  // Both see the Flip coin button in the turn selection UI
  await expect(alice.getByRole('button', {name: /flip coin/i})).toBeVisible({timeout: 10_000});

  // Alice flips the coin — commitment protocol assigns turns randomly
  await alice.getByRole('button', {name: /flip coin/i}).click();

  // Both peers receive a turn assignment (one gets Your turn, the other Waiting)
  await expect(alice.locator('.game-announcement')).toContainText(/your turn|waiting/i, {timeout: 10_000});
  await expect(bob.locator('.game-announcement')).toContainText(/your turn|waiting/i, {timeout: 10_000});

  // The two assignments are opposite
  const aliceText = await alice.locator('.game-announcement').textContent() ?? '';
  const bobText = await bob.locator('.game-announcement').textContent() ?? '';
  expect(/your turn/i.test(aliceText)).not.toBe(/your turn/i.test(bobText));

  await aliceCtx.close();
  await bobCtx.close();
});

test('game shows disconnected status when opponent leaves mid-game', async ({browser}) => {
  test.setTimeout(120_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  // Track RTCPeerConnection instances on Bob's page so we can close them explicitly.
  // On localhost loopback, closing a browser context doesn't trigger ICE state changes —
  // explicitly closing connections fires the events Alice's handler needs.
  await bob.addInitScript(() => {
    const pcs: RTCPeerConnection[] = [];
    const Original = RTCPeerConnection;
    (window as unknown as {RTCPeerConnection: typeof RTCPeerConnection}).RTCPeerConnection =
      class extends Original {
        constructor(...args: ConstructorParameters<typeof Original>) {
          super(...args);
          pcs.push(this);
        }
      };
    (window as unknown as {__rtcPeerConnections: RTCPeerConnection[]})
      .__rtcPeerConnections = pcs;
  });

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();
  await placeAllShips(bob);
  await bob.getByRole('button', {name: /confirm placement/i}).click();

  await connectPeers(alice, bob);

  // Alice challenges Bob
  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();
  await bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'}).click();

  await expect(alice.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 10_000});
  await expect(bob.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 10_000});

  await alice.getByRole('button', {name: /use this board/i}).click();
  await bob.getByRole('button', {name: /use this board/i}).click();

  await expect(alice.getByRole('button', {name: /go first/i})).toBeVisible({timeout: 10_000});
  await alice.getByRole('button', {name: /go first/i}).click();

  await expect(alice.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 10_000});
  await expect(bob.locator('.game-announcement')).toContainText(/waiting/i, {timeout: 10_000});

  // Alice fires a shot
  await alice.getByRole('region', {name: /tracking board/i})
    .getByRole('button', {name: 'Row 6, Column 6', exact: true}).click();
  await expect(bob.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 10_000});

  // Close Bob's peer connections explicitly, then close his browser context.
  // On localhost loopback, context close alone doesn't trigger ICE state changes.
  await bob.evaluate(() => {
    const pcs = (window as unknown as {__rtcPeerConnections: RTCPeerConnection[]})
      .__rtcPeerConnections;
    pcs.forEach(pc => pc.close());
  });
  await bobCtx.close();
  await expect(alice.locator('.game-announcement')).toContainText(/disconnected.*game saved/i, {timeout: 15_000});

  // Alice's shot history is preserved during disconnect
  const trackingBoard = alice.getByRole('region', {name: /tracking board/i});
  await expect(trackingBoard.locator('.miss')).toHaveCount(1);

  // Forfeit button is hidden during disconnect
  await expect(alice.getByRole('button', {name: /forfeit/i})).not.toBeVisible();

  await aliceCtx.close();
});

test('game resumes after peer disconnects and reconnects via server', async ({browser}) => {
  test.setTimeout(180_000);

  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto('/battleship/');
  await bob.goto('/battleship/');

  await expect(alice.getByText('Service online')).toBeVisible();
  await expect(bob.getByText('Service online')).toBeVisible();

  await placeAllShips(alice);
  await alice.getByRole('button', {name: /confirm placement/i}).click();
  await placeAllShips(bob);
  await bob.getByRole('button', {name: /confirm placement/i}).click();

  // Server-mediated connection creates signaling ID mappings needed for game save/load
  await alice.getByRole('list', {name: 'Online peers'}).getByRole('button', {name: 'Connect'}).first().click();
  await expect(alice.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});
  await expect(bob.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});

  await alice.getByRole('list', {name: 'Connected peers'}).getByRole('button', {name: 'Challenge'}).click();
  await bob.locator('[aria-label="Alerts"]').getByRole('button', {name: 'Accept'}).click();

  await expect(alice.getByRole('region', {name: /game vs/i})).toBeVisible({timeout: 10_000});
  await alice.getByRole('button', {name: /use this board/i}).click();
  await bob.getByRole('button', {name: /use this board/i}).click();

  await expect(alice.getByRole('button', {name: /go first/i})).toBeVisible({timeout: 10_000});
  await alice.getByRole('button', {name: /go first/i}).click();

  await expect(alice.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 10_000});

  await alice.getByRole('region', {name: /tracking board/i})
    .getByRole('button', {name: 'Row 6, Column 6', exact: true}).click();
  await expect(bob.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 10_000});

  // Bob refreshes — WebRTC drops, signaling cookie persists
  await bob.reload();
  await expect(bob.getByText('Service online')).toBeVisible({timeout: 10_000});

  await expect(alice.locator('.game-announcement')).toContainText(/disconnected/i, {timeout: 15_000});

  // Alice reconnects via Previous peers
  await expect(alice.getByRole('list', {name: 'Previous peers'}).getByRole('button', {name: 'Reconnect'})).toBeVisible({timeout: 15_000});
  await alice.getByRole('list', {name: 'Previous peers'}).getByRole('button', {name: 'Reconnect'}).click();

  await expect(alice.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});
  await expect(bob.getByRole('button', {name: 'Disconnect'})).toBeVisible({timeout: 30_000});

  // Game resumes with correct phases and shot history
  await expect(bob.locator('.game-announcement')).toContainText(/your turn/i, {timeout: 15_000});
  await expect(alice.locator('.game-announcement')).toContainText(/waiting/i, {timeout: 15_000});
  await expect(bob.getByRole('region', {name: /your fleet/i})).toContainText(/miss/i, {timeout: 5_000});

  await aliceCtx.close();
  await bobCtx.close();
});
