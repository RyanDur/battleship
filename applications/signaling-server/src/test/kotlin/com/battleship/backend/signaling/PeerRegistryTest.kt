package com.battleship.backend.signaling

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue

class PeerRegistryTest {

    private val registry = PeerRegistry(InMemoryRelationshipRepository())

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
    fun `getPreviousPeers resolves names from repository even when peer was never registered in this session`() {
        val repo = InMemoryRelationshipRepository()
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
