package com.battleship.backend.signaling

import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Entity
class PeerRelationship(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,
    var peerId1: String = "",
    var peerId2: String = "",
)

@Entity
class PeerName(
    @Id
    var peerId: String = "",
    var name: String = "",
)

@Repository
interface PeerRelationshipJpaRepository : JpaRepository<PeerRelationship, Long> {
    @Query("SELECT r FROM PeerRelationship r WHERE r.peerId1 = :peerId OR r.peerId2 = :peerId")
    fun findAllByPeerId(peerId: String): List<PeerRelationship>
}

@Repository
interface PeerNameJpaRepository : JpaRepository<PeerName, String>

class JpaPeerRelationshipRepository(
    private val jpaRepo: PeerRelationshipJpaRepository,
    private val nameRepo: PeerNameJpaRepository,
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

    override fun saveName(peerId: String, name: String) {
        nameRepo.save(PeerName(peerId = peerId, name = name))
    }

    override fun findName(peerId: String): String? =
        nameRepo.findById(peerId).orElse(null)?.name
}
