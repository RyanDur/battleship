package com.battleship.backend.signaling

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class RelationshipConfig {

    @Bean
    fun relationshipRepository(jpaRepo: PeerRelationshipJpaRepository, nameRepo: PeerNameJpaRepository): RelationshipRepository =
        JpaPeerRelationshipRepository(jpaRepo, nameRepo)
}
