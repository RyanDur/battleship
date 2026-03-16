package com.battleship.backend.signaling

import java.util.concurrent.ConcurrentHashMap

class InMemoryRelationshipRepository : RelationshipRepository {
    private val relationships = ConcurrentHashMap<String, MutableSet<String>>()

    override fun save(peerId1: String, peerId2: String) {
        relationships.getOrPut(peerId1) { mutableSetOf() }.add(peerId2)
        relationships.getOrPut(peerId2) { mutableSetOf() }.add(peerId1)
    }

    override fun findRelated(peerId: String): Set<String> =
        relationships[peerId] ?: emptySet()
}