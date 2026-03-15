package com.battleship.backend.signaling

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue

class PeerRegistryTest {

    private val registry = PeerRegistry()

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
    fun `getName returns the registered name`() {
        registry.register("peer-1", "Alice")

        assertEquals("Alice", registry.getName("peer-1"))
    }
}
