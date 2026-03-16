package com.battleship.backend.signaling

import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Entity
data class PeerRelationship(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,
    val peerId1: String = "",
    val peerId2: String = "",
)

@Repository
interface PeerRelationshipJpaRepository : JpaRepository<PeerRelationship, Long> {
    @Query("SELECT r FROM PeerRelationship r WHERE r.peerId1 = :peerId OR r.peerId2 = :peerId")
    fun findAllByPeerId(peerId: String): List<PeerRelationship>
}

class JpaPeerRelationshipRepository(
    private val jpaRepo: PeerRelationshipJpaRepository,
) : RelationshipRepository {

    override fun save(peerId1: String, peerId2: String) {
        val exists = jpaRepo.findAllByPeerId(peerId1).any {
            (it.peerId1 == peerId1 && it.peerId2 == peerId2) ||
            (it.peerId1 == peerId2 && it.peerId2 == peerId1)
        }
        if (!exists) {
            jpaRepo.save(PeerRelationship(peerId1 = peerId1, peerId2 = peerId2))
        }
    }

    override fun findRelated(peerId: String): Set<String> =
        jpaRepo.findAllByPeerId(peerId).map { rel ->
            if (rel.peerId1 == peerId) rel.peerId2 else rel.peerId1
        }.toSet()
}