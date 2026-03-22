package com.battleship.backend.signaling

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Entity
class PlayerBoard(
    @Id
    var peerId: String = "",
    @Column(columnDefinition = "TEXT")
    var boardData: String = "",
)

@Repository
interface PlayerBoardJpaRepository : JpaRepository<PlayerBoard, String>

interface GameBoardGateway {
    fun save(peerId: String, boardData: String)
    fun find(peerId: String): String?
}

class JpaGameBoardGateway(private val repo: PlayerBoardJpaRepository) : GameBoardGateway {

    override fun save(peerId: String, boardData: String) {
        val existing = repo.findById(peerId).orElse(null)
        if (existing != null) {
            existing.boardData = boardData
            repo.save(existing)
        } else {
            repo.save(PlayerBoard(peerId = peerId, boardData = boardData))
        }
    }

    override fun find(peerId: String): String? =
        repo.findById(peerId).orElse(null)?.boardData
}