package com.battleship.backend.signaling

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class RelationshipConfig {

    @Bean
    fun peerRelationshipGateway(jpaRepo: PeerRelationshipJpaRepository, nameRepo: PeerNameJpaRepository, forgottenRepo: ForgottenPairJpaRepository, emailRepo: PeerEmailJpaRepository, sharingRepo: SharedEmailPermissionJpaRepository): PeerRelationshipGateway =
        JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)
}
