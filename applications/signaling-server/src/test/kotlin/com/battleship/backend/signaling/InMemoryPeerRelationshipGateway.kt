package com.battleship.backend.signaling

import java.util.concurrent.ConcurrentHashMap

class InMemoryPeerRelationshipGateway : PeerRelationshipGateway {
    private val relationships = ConcurrentHashMap<String, MutableSet<String>>()
    private val names = ConcurrentHashMap<String, String>()
    private val forgotten = mutableSetOf<Pair<String, String>>()
    private val emails = ConcurrentHashMap<String, String>()
    private val sharing = mutableSetOf<Pair<String, String>>()

    override fun save(peerId1: String, peerId2: String) {
        relationships.getOrPut(peerId1) { mutableSetOf() }.add(peerId2)
        relationships.getOrPut(peerId2) { mutableSetOf() }.add(peerId1)
    }

    override fun findRelated(peerId: String): Set<String> =
        (relationships[peerId] ?: emptySet()).filter { related ->
            !forgotten.contains(peerId to related) && !forgotten.contains(related to peerId)
        }.toSet()

    override fun saveName(peerId: String, name: String) {
        names[peerId] = name
    }

    override fun findName(peerId: String): String? = names[peerId]

    override fun forget(peerId: String, targetPeerId: String) {
        forgotten.add(peerId to targetPeerId)
    }

    override fun saveEmail(peerId: String, email: String) {
        emails[peerId] = email
    }

    override fun findEmail(peerId: String): String? = emails[peerId]

    override fun addSharing(sharerPeerId: String, receiverPeerId: String) {
        sharing.add(sharerPeerId to receiverPeerId)
    }

    override fun removeSharing(sharerPeerId: String, receiverPeerId: String) {
        sharing.remove(sharerPeerId to receiverPeerId)
    }

    override fun hasSharing(sharerPeerId: String, receiverPeerId: String): Boolean =
        sharing.contains(sharerPeerId to receiverPeerId)
}
