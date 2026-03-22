package com.battleship.backend.signaling

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class GameConfig {

    @Bean
    fun gameBoardGateway(repo: PlayerBoardJpaRepository): GameBoardGateway =
        JpaGameBoardGateway(repo)

    @Bean
    fun gameSessionGateway(repo: GameSessionJpaRepository, objectMapper: ObjectMapper): GameSessionGateway =
        JpaGameSessionGateway(repo, objectMapper)
}
