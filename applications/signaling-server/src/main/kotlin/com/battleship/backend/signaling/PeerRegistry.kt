package com.battleship.backend.signaling

import org.springframework.stereotype.Component
import java.util.concurrent.ConcurrentHashMap

data class PeerInfo(val peerId: String, val name: String)

data class PreviousPeerInfo(val peerId: String, val name: String, val online: Boolean)

interface RelationshipRepository {
    fun save(peerId1: String, peerId2: String)
    fun findRelated(peerId: String): Set<String>
    fun saveName(peerId: String, name: String)
    fun findName(peerId: String): String?
}

@Component
class PeerRegistry(private val relationships: RelationshipRepository) {
    private val peers = ConcurrentHashMap<String, String>()

    fun register(peerId: String, name: String) {
        peers[peerId] = name
        relationships.saveName(peerId, name)
    }

    fun unregister(peerId: String) {
        peers.remove(peerId)
    }

    fun recordRelationship(peerId1: String, peerId2: String) {
        relationships.save(peerId1, peerId2)
    }

    fun getPreviousPeers(peerId: String): List<PreviousPeerInfo> =
        relationships.findRelated(peerId).mapNotNull { relatedId ->
            val name = relationships.findName(relatedId) ?: return@mapNotNull null
            PreviousPeerInfo(peerId = relatedId, name = name, online = peers.containsKey(relatedId))
        }

    fun getPeers(): List<PeerInfo> =
        peers.entries.map { PeerInfo(it.key, it.value) }

    fun getPeersExcluding(peerId: String): List<PeerInfo> =
        getPeers().filter { it.peerId != peerId }
}
