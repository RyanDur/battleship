package com.battleship.backend.signaling

import com.fasterxml.jackson.databind.ObjectMapper

class JpaGameSessionGateway(
    private val repo: GameSessionJpaRepository,
    private val objectMapper: ObjectMapper,
) : GameSessionGateway {

    override fun save(peerId: String, state: GameState) {
        val json = objectMapper.writeValueAsString(state)
        val existing = repo.findById(peerId).orElse(null)
        if (existing != null) {
            existing.gameData = json
            repo.save(existing)
        } else {
            repo.save(GameSession(peerId = peerId, gameData = json))
        }
    }

    override fun find(peerId: String): GameState? {
        val json = repo.findById(peerId).orElse(null)?.gameData ?: return null
        return objectMapper.readValue(json, GameState::class.java)
    }

    override fun delete(peerId: String) {
        repo.deleteById(peerId)
    }
}
