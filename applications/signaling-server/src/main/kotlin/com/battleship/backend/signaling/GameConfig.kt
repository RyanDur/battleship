package com.battleship.backend.signaling

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class GameConfig {

    @Bean
    fun gameBoardGateway(repo: PlayerBoardJpaRepository): GameBoardGateway =
        JpaGameBoardGateway(repo)
}
