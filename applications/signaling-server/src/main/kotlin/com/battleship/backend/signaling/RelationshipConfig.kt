package com.battleship.backend.signaling

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class RelationshipConfig {

    @Bean
    fun relationshipRepository(jpaRepo: PeerRelationshipJpaRepository, nameRepo: PeerNameJpaRepository, forgottenRepo: ForgottenPairJpaRepository, emailRepo: PeerEmailJpaRepository, sharingRepo: SharedEmailPermissionJpaRepository): RelationshipRepository =
        JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)
}
