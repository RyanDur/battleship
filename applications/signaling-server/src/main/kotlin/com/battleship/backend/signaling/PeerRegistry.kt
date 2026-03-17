package com.battleship.backend.signaling

import org.springframework.stereotype.Component
import java.util.concurrent.ConcurrentHashMap

data class PeerInfo(val peerId: String, val name: String)

data class PreviousPeerInfo(val peerId: String, val name: String, val online: Boolean, val email: String? = null)

interface RelationshipRepository {
    fun save(peerId1: String, peerId2: String)
    fun findRelated(peerId: String): Set<String>
    fun saveName(peerId: String, name: String)
    fun findName(peerId: String): String?
    fun forget(peerId: String, targetPeerId: String)
    fun saveEmail(peerId: String, email: String)
    fun findEmail(peerId: String): String?
    fun addSharing(sharerPeerId: String, receiverPeerId: String)
    fun removeSharing(sharerPeerId: String, receiverPeerId: String)
    fun hasSharing(sharerPeerId: String, receiverPeerId: String): Boolean
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

    fun forgetRelationship(peerId: String, targetPeerId: String) {
        relationships.forget(peerId, targetPeerId)
    }

    fun saveEmail(peerId: String, email: String) {
        relationships.saveEmail(peerId, email)
    }

    fun shareEmail(fromPeerId: String, toPeerId: String) {
        relationships.addSharing(fromPeerId, toPeerId)
    }

    fun stopSharingEmail(fromPeerId: String, toPeerId: String) {
        relationships.removeSharing(fromPeerId, toPeerId)
    }

    fun getSharedEmail(fromPeerId: String, toPeerId: String): String? =
        if (relationships.hasSharing(fromPeerId, toPeerId)) relationships.findEmail(fromPeerId) else null

    fun getPreviousPeers(peerId: String): List<PreviousPeerInfo> =
        relationships.findRelated(peerId).mapNotNull { relatedId ->
            val name = relationships.findName(relatedId) ?: return@mapNotNull null
            val email = if (relationships.hasSharing(relatedId, peerId)) relationships.findEmail(relatedId) else null
            PreviousPeerInfo(peerId = relatedId, name = name, online = peers.containsKey(relatedId), email = email)
        }

    fun getPeers(): List<PeerInfo> =
        peers.entries.map { PeerInfo(it.key, it.value) }

    fun getPeersExcluding(peerId: String): List<PeerInfo> =
        getPeers().filter { it.peerId != peerId }
}
