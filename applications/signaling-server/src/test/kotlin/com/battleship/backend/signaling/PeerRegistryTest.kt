package com.battleship.backend.signaling

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue

class PeerRegistryTest {

    private val registry = PeerRegistry(InMemoryPeerRelationshipGateway())

    @Test
    fun `registered peer appears in peer list`() {
        registry.register("peer-1", "Alice")

        val peers = registry.getPeers()
        assertEquals(1, peers.size)
        assertEquals("peer-1", peers[0].peerId)
        assertEquals("Alice", peers[0].name)
    }

    @Test
    fun `unregistered peer is removed from list`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.unregister("peer-1")

        val peers = registry.getPeers()
        assertEquals(1, peers.size)
        assertEquals("peer-2", peers[0].peerId)
    }

    @Test
    fun `getPeers excludes the requesting peer`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")

        val peers = registry.getPeersExcluding("peer-1")
        assertEquals(1, peers.size)
        assertEquals("peer-2", peers[0].peerId)
    }

    @Test
    fun `recordRelationship stores bidirectional relationship`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")

        val alicePrev = registry.getPreviousPeers("peer-1")
        val bobPrev = registry.getPreviousPeers("peer-2")

        assertEquals(1, alicePrev.size)
        assertEquals("peer-2", alicePrev[0].peerId)
        assertEquals(1, bobPrev.size)
        assertEquals("peer-1", bobPrev[0].peerId)
    }

    @Test
    fun `previous peer is online when currently registered`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")

        val prev = registry.getPreviousPeers("peer-1")

        assertEquals("Bob", prev[0].name)
        assertEquals(true, prev[0].online)
    }

    @Test
    fun `previous peer is offline when unregistered`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")
        registry.unregister("peer-2")

        val prev = registry.getPreviousPeers("peer-1")

        assertEquals("Bob", prev[0].name)
        assertEquals(false, prev[0].online)
    }

    @Test
    fun `getPreviousPeers returns empty when no relationships`() {
        registry.register("peer-1", "Alice")

        val prev = registry.getPreviousPeers("peer-1")

        assertTrue(prev.isEmpty())
    }

    @Test
    fun `forgotten peer no longer appears in previous peers`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")

        registry.forgetRelationship("peer-1", "peer-2")

        assertTrue(registry.getPreviousPeers("peer-1").isEmpty())
    }

    @Test
    fun `forgetful peer no longer appears in forgotten peer's previous peers`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")

        registry.forgetRelationship("peer-1", "peer-2")

        assertTrue(registry.getPreviousPeers("peer-2").isEmpty())
    }

    @Test
    fun `email appears in previous peers when sharer had shared with that peer`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")
        registry.saveEmail("peer-1", "alice@example.com")
        registry.shareEmail("peer-1", "peer-2")

        val prev = registry.getPreviousPeers("peer-2")

        assertEquals("alice@example.com", prev[0].email)
    }

    @Test
    fun `email is null in previous peers when sharer has not shared`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")
        registry.saveEmail("peer-1", "alice@example.com")

        val prev = registry.getPreviousPeers("peer-2")

        assertNull(prev[0].email)
    }

    @Test
    fun `sharing is directional - peer-2 sharing does not expose peer-1's email to peer-2`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")
        registry.saveEmail("peer-1", "alice@example.com")
        registry.shareEmail("peer-1", "peer-2")

        // peer-1 shares with peer-2, so peer-2 sees peer-1's email
        // peer-1 should NOT see peer-2's email (no sharing in that direction)
        val prev1 = registry.getPreviousPeers("peer-1")
        assertNull(prev1[0].email)
    }

    @Test
    fun `stopSharingEmail removes email from previous peers`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")
        registry.saveEmail("peer-1", "alice@example.com")
        registry.shareEmail("peer-1", "peer-2")
        registry.stopSharingEmail("peer-1", "peer-2")

        val prev = registry.getPreviousPeers("peer-2")

        assertNull(prev[0].email)
    }

    @Test
    fun `getSharedEmail returns email when sharing is active`() {
        registry.register("peer-1", "Alice")
        registry.saveEmail("peer-1", "alice@example.com")
        registry.shareEmail("peer-1", "peer-2")

        assertEquals("alice@example.com", registry.getSharedEmail("peer-1", "peer-2"))
    }

    @Test
    fun `getSharedEmail returns null when not sharing`() {
        registry.register("peer-1", "Alice")
        registry.saveEmail("peer-1", "alice@example.com")

        assertNull(registry.getSharedEmail("peer-1", "peer-2"))
    }

    @Test
    fun `email from savePeerEmail appears in previous peers`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")
        registry.savePeerEmail("peer-1", "peer-2", "bob@example.com")

        val prev = registry.getPreviousPeers("peer-1")

        assertEquals("bob@example.com", prev[0].email)
    }

    @Test
    fun `savePeerEmail does not expose email to the target peer`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")
        registry.savePeerEmail("peer-1", "peer-2", "bob@example.com")

        val prev = registry.getPreviousPeers("peer-2")

        assertNull(prev[0].email)
    }

    @Test
    fun `shared email takes precedence over manually saved email in previous peers`() {
        registry.register("peer-1", "Alice")
        registry.register("peer-2", "Bob")
        registry.recordRelationship("peer-1", "peer-2")
        // Bob shares his own email with Alice
        registry.saveEmail("peer-2", "bob-shared@example.com")
        registry.shareEmail("peer-2", "peer-1")
        // Alice also manually saved Bob's email
        registry.savePeerEmail("peer-1", "peer-2", "bob-manual@example.com")

        val prev = registry.getPreviousPeers("peer-1")

        assertEquals("bob-shared@example.com", prev[0].email)
    }

    @Test
    fun `getPreviousPeers resolves names from repository even when peer was never registered in this session`() {
        val repo = InMemoryPeerRelationshipGateway()
        // Simulate a previous session: Bob and Alice were connected
        repo.save("peer-1", "peer-2")
        repo.saveName("peer-1", "Alice")
        repo.saveName("peer-2", "Bob")

        // Fresh registry — peer-1 ("Alice") was never registered in this session
        val freshRegistry = PeerRegistry(repo)

        val prev = freshRegistry.getPreviousPeers("peer-1")

        assertEquals(1, prev.size)
        assertEquals("peer-2", prev[0].peerId)
        assertEquals("Bob", prev[0].name)
        assertEquals(false, prev[0].online)
    }

}
