package com.battleship.backend.signaling

import java.util.concurrent.ConcurrentHashMap

data class PeerInfo(val peerId: String, val name: String)

class PeerRegistry {
    private val peers = ConcurrentHashMap<String, String>()

    fun register(peerId: String, name: String) {
        peers[peerId] = name
    }

    fun unregister(peerId: String) {
        peers.remove(peerId)
    }

    fun getPeers(): List<PeerInfo> =
        peers.entries.map { PeerInfo(it.key, it.value) }

    fun getPeersExcluding(peerId: String): List<PeerInfo> =
        getPeers().filter { it.peerId != peerId }

    fun getName(peerId: String): String? =
        peers[peerId]
}
