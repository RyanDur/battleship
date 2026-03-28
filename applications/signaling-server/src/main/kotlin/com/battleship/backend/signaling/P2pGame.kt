package com.battleship.backend.signaling

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Entity
class P2pGameState(
    @Id
    var pairKey: String = "",
    @Column(columnDefinition = "TEXT")
    var gameData: String = "",
)

@Repository
interface P2pGameStateJpaRepository : JpaRepository<P2pGameState, String>

interface P2pGameGateway {
    fun save(peerId1: String, peerId2: String, gameState: String)
    fun find(peerId1: String, peerId2: String): String?
}

class JpaP2pGameGateway(private val repo: P2pGameStateJpaRepository) : P2pGameGateway {

    override fun save(peerId1: String, peerId2: String, gameState: String) {
        val key = pairKey(peerId1, peerId2)
        val existing = repo.findById(key).orElse(null)
        if (existing != null) {
            existing.gameData = gameState
            repo.save(existing)
        } else {
            repo.save(P2pGameState(pairKey = key, gameData = gameState))
        }
    }

    override fun find(peerId1: String, peerId2: String): String? =
        repo.findById(pairKey(peerId1, peerId2)).orElse(null)?.gameData

    private fun pairKey(peerId1: String, peerId2: String): String =
        "$peerId1:$peerId2"
}
